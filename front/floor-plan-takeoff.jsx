import { useState, useEffect, useRef, useCallback } from "react";

/*
  FLOOR PLAN TAKEOFF TOOL
  ========================
  1. Upload floor plan image
  2. Calibrate scale (draw a line over a known dimension)
  3. Draw polygons (rooms/areas) and lines (walls/openings)
  4. Categorize into layers
  5. Auto-calculate quantities
  6. Export to Teuchos Builder
*/

const DEFAULT_LAYERS = [
  { id: "room_internal", label: "Εσωτερικός Χώρος", color: "#4A90D9", icon: "🏠", calcType: "area" },
  { id: "room_wc", label: "WC / Υγροί Χώροι", color: "#E67E22", icon: "🚿", calcType: "area" },
  { id: "room_kitchen", label: "Κουζίνα", color: "#27AE60", icon: "🍳", calcType: "area" },
  { id: "balcony", label: "Μπαλκόνι / Βεράντα", color: "#8E44AD", icon: "☀️", calcType: "area" },
  { id: "terrace", label: "Ταράτσα / Δώμα", color: "#1ABC9C", icon: "🏗️", calcType: "area" },
  { id: "parking", label: "Parking / Εξωτερικό", color: "#95A5A6", icon: "🅿️", calcType: "area" },
  { id: "wall_ext", label: "Εξωτερικός Τοίχος", color: "#C0392B", icon: "🧱", calcType: "line" },
  { id: "wall_int", label: "Εσωτερικός Τοίχος", color: "#D35400", icon: "▬", calcType: "line" },
  { id: "wall_wc", label: "Τοίχος WC (ανθυγρός)", color: "#E74C3C", icon: "💧", calcType: "line" },
  { id: "opening_door", label: "Πόρτα", color: "#2ECC71", icon: "🚪", calcType: "line" },
  { id: "opening_window", label: "Παράθυρο", color: "#3498DB", icon: "🪟", calcType: "line" },
  { id: "opening_sliding", label: "Συρόμενο Κούφωμα", color: "#9B59B6", icon: "↔️", calcType: "line" },
];

const CUSTOM_COLORS = ["#E91E63","#FF5722","#795548","#607D8B","#009688","#CDDC39","#FF9800","#3F51B5","#00BCD4","#8BC34A","#F44336","#673AB7"];

const WALL_HEIGHT = 2.80;
const TILE_HEIGHT_WC = 2.40;

const fmt = (n) => new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const STORAGE_KEY = "takeoff-projects-v1";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const BACKEND_URL = "http://localhost:8000"; // local room-detection API (back/)

export default function FloorPlanTakeoff() {
  // Projects
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveRef = useRef(null);

  // Image
  const [image, setImage] = useState(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Calibration
  const [calibrated, setCalibrated] = useState(false);
  const [calLine, setCalLine] = useState(null);
  const [calMeters, setCalMeters] = useState("");
  const [pixelsPerMeter, setPPM] = useState(0);

  // Drawing
  const [tool, setTool] = useState("select");
  const [activeLayer, setActiveLayer] = useState("room_internal");
  const [shapes, setShapes] = useState([]);
  const [currentPoints, setCurrentPoints] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [wallHeight, setWallHeight] = useState(WALL_HEIGHT);

  // Undo history
  const [history, setHistory] = useState([]);
  const MAX_UNDO = 50;

  // Ortho / Snap
  const [orthoMode, setOrthoMode] = useState(false); // constrain to 90° angles

  // Drag
  const [dragging, setDragging] = useState(null); // {shapeId, pointIdx}

  // AI Detection
  const [detecting, setDetecting] = useState(false);
  const [engine, setEngine] = useState("classical"); // backend engine: classical | cubicasa
  const [cloudStatus, setCloudStatus] = useState(""); // Supabase sync indicator
  const cloudIdRef = useRef({});      // local project id -> Supabase project id
  const cloudTimerRef = useRef(null);
  const imageUploadedRef = useRef({}); // cloud project id -> last uploaded image dataURL
  const [catPrices, setCatPrices] = useState({}); // catalog code -> unit_price (single source of truth)

  // Custom Layers
  const [customLayers, setCustomLayers] = useState([]);
  const [showAddLayer, setShowAddLayer] = useState(false);
  const [newLayerName, setNewLayerName] = useState("");
  const [newLayerType, setNewLayerType] = useState("area");
  const LAYER_TYPES = [...DEFAULT_LAYERS, ...customLayers];

  // UI
  const [showExport, setShowExport] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [view, setView] = useState("projects"); // "projects" | "canvas"

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // ── Load from storage ──
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) {
          const data = JSON.parse(r.value);
          setProjects(data.projects || []);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // ── Load catalog unit prices (single source of truth for derived quantities) ──
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(BACKEND_URL + "/catalog");
        if (!r.ok) return;
        const m = {};
        for (const it of await r.json()) if (it.code) m[it.code] = Number(it.unit_price);
        setCatPrices(m);
      } catch {}
    })();
  }, []);

  // ── Persist (debounced) ──
  const persist = useCallback((projs) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ projects: projs, savedAt: Date.now() }));
      } catch {}
      setSaving(false);
    }, 800);
  }, []);

  // ── Save current state into active project ──
  const saveCurrentToProject = useCallback(() => {
    if (!activeProjectId) return;
    setProjects(prev => {
      const updated = prev.map(p => p.id === activeProjectId ? {
        ...p,
        image, imgSize, calibrated, calLine, calMeters, pixelsPerMeter,
        shapes, wallHeight, customLayers, updatedAt: Date.now(),
      } : p);
      persist(updated);
      return updated;
    });
  }, [activeProjectId, image, imgSize, calibrated, calLine, calMeters, pixelsPerMeter, shapes, wallHeight, customLayers, persist]);

  // ── Auto-save on every change ──
  useEffect(() => {
    if (activeProjectId && !loading) {
      saveCurrentToProject();
    }
  }, [shapes, calibrated, pixelsPerMeter, wallHeight, customLayers]);

  // ── Load project into canvas ──
  const loadProject = (proj) => {
    setImage(proj.image || null);
    setImgSize(proj.imgSize || { w: 0, h: 0 });
    setCalibrated(proj.calibrated || false);
    setCalLine(proj.calLine || null);
    setCalMeters(proj.calMeters || "");
    setPPM(proj.pixelsPerMeter || 0);
    setShapes(proj.shapes || []);
    setWallHeight(proj.wallHeight || WALL_HEIGHT);
    setCustomLayers(proj.customLayers || []);
    setActiveProjectId(proj.id);
    setTool(proj.calibrated ? "select" : "calibrate");
    setCurrentPoints([]);
    setSelectedId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setShowExport(false);
    setView("canvas");
    // Cloud project without a local image → fetch a signed URL from Supabase Storage.
    if (!proj.image) {
      const cid = cloudIdRef.current[proj.id];
      if (cid) {
        fetch(BACKEND_URL + "/projects/" + cid + "/image-url")
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => { if (j?.url) setImage(j.url); })
          .catch(() => {});
      }
    }
  };

  // ── Create new project ──
  const createProject = (name) => {
    const p = { id: uid(), name: name || "Νέο Project " + (projects.length + 1), image: null, imgSize: { w: 0, h: 0 }, calibrated: false, calLine: null, calMeters: "", pixelsPerMeter: 0, shapes: [], wallHeight: WALL_HEIGHT, createdAt: Date.now(), updatedAt: Date.now() };
    const updated = [...projects, p];
    setProjects(updated);
    persist(updated);
    loadProject(p);
  };

  // ── Delete project ──
  const deleteProject = (id) => {
    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    persist(updated);
    if (activeProjectId === id) {
      setActiveProjectId(null);
      setView("projects");
    }
  };

  // ── Rename project ──
  const renameProject = (id, name) => {
    const updated = projects.map(p => p.id === id ? { ...p, name } : p);
    setProjects(updated);
    persist(updated);
  };

  // ── Image Upload ──
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5000000) { alert("Μέγιστο μέγεθος 5MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        setImgSize({ w: img.width, h: img.height });
        setImage(ev.target.result);
        setCalibrated(false);
        setCalLine(null);
        setCalMeters("");
        setPPM(0);
        setShapes([]);
        setTool("calibrate");
        // If no active project, create one
        if (!activeProjectId) {
          createProject(file.name.replace(/\.(png|jpg|jpeg|pdf|webp)$/i, ""));
        }
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // ── Calibration ──
  const doCalibrate = () => {
    if (!calLine || !calMeters) return;
    const dx = calLine.x2 - calLine.x1;
    const dy = calLine.y2 - calLine.y1;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const meters = parseFloat(calMeters);
    if (meters > 0 && pixelDist > 0) {
      setPPM(pixelDist / meters);
      setCalibrated(true);
      setTool("polygon");
    }
  };

  // ── AI Auto-Detect Rooms ──
  const [aiStatus, setAiStatus] = useState("");

  const resizeImage = (src, maxW) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve({ data: dataUrl.split(",")[1], w, h, scale });
        };
        img.onerror = () => reject(new Error("Image resize failed"));
        img.src = src;
      } catch (e) { reject(e); }
    });
  };

  // Claude-vision detection via the backend proxy (no browser CORS, key stays server-side).
  const autoDetect = () => autoDetectBackend("claude");

  // ── Backend Auto-Detect (local back/ API: classical CV or CubiCasa) ──
  const autoDetectBackend = async (engineOverride) => {
    const eng = (typeof engineOverride === "string" && engineOverride) || engine;
    if (!image) { setAiStatus("✗ Φόρτωσε πρώτα εικόνα"); return; }
    setDetecting(true);
    setAiStatus("Αποστολή στο backend (" + eng + ")...");
    try {
      const blob = await (await fetch(image)).blob();
      const fd = new FormData();
      fd.append("file", blob, "plan.png");
      fd.append("engine", eng);
      if (calibrated && pixelsPerMeter) fd.append("pixels_per_meter", String(pixelsPerMeter));

      const res = await fetch(BACKEND_URL + "/detect", { method: "POST", body: fd });
      if (!res.ok) { setAiStatus("✗ Backend HTTP " + res.status + (eng === "claude" ? " (έλεγξε ANTHROPIC_API_KEY)" : "")); setDetecting(false); return; }
      const data = await res.json();
      const rooms = Array.isArray(data.rooms) ? data.rooms : [];

      const newShapes = rooms
        .filter(r => r?.points?.length >= 3)
        .map(r => ({
          id: uid(), type: "polygon",
          layer: LAYER_TYPES.find(l => l.id === r.type) ? r.type : "room_internal",
          points: r.points.map(p => ({ x: Math.round(Number(p.x)), y: Math.round(Number(p.y)) })),
          label: r.label || "Χώρος",
        }));

      if (newShapes.length === 0) { setAiStatus("✗ 0 δωμάτια (" + eng + ")"); setDetecting(false); return; }
      pushUndo();
      setShapes(prev => [...prev, ...newShapes]);
      setTool("select");
      setAiStatus("✓ " + newShapes.length + " δωμάτια (" + eng + "). Διόρθωσε κορυφές/layers.");
    } catch (err) {
      setAiStatus("✗ Backend error — τρέχει ο server; (" + String(err).slice(0, 90) + ")");
    }
    setDetecting(false);
    setTimeout(() => setAiStatus(""), 12000);
  };

  // ── Auto-Extract Walls from Room Polygons ──
  const autoDetectWalls = () => {
    const roomShapes = shapes.filter(s => s.type === "polygon");
    if (roomShapes.length === 0) {
      setAiStatus("✗ Πρώτα αναγνώρισε χώρους, μετά εξάγονται οι τοίχοι αυτόματα.");
      setTimeout(() => setAiStatus(""), 5000);
      return;
    }

    setAiStatus("Εξαγωγή τοίχων από polygons...");
    const newWalls = [];
    const SNAP_DIST = 20; // pixels — distance to consider edges as "shared"

    // Collect all edges from all rooms
    const allEdges = [];
    roomShapes.forEach(s => {
      for (let i = 0; i < s.points.length; i++) {
        const j = (i + 1) % s.points.length;
        allEdges.push({
          p1: s.points[i],
          p2: s.points[j],
          roomId: s.id,
          roomLayer: s.layer,
          roomLabel: s.label,
        });
      }
    });

    // Check if two edges are approximately the same (shared wall)
    const edgesMatch = (e1, e2) => {
      const d1a = Math.hypot(e1.p1.x - e2.p1.x, e1.p1.y - e2.p1.y);
      const d1b = Math.hypot(e1.p1.x - e2.p2.x, e1.p1.y - e2.p2.y);
      const d2a = Math.hypot(e1.p2.x - e2.p1.x, e1.p2.y - e2.p1.y);
      const d2b = Math.hypot(e1.p2.x - e2.p2.x, e1.p2.y - e2.p2.y);
      return (d1a < SNAP_DIST && d2b < SNAP_DIST) || (d1b < SNAP_DIST && d2a < SNAP_DIST);
    };

    // Classify each edge
    const processed = new Set();
    allEdges.forEach((edge, idx) => {
      if (processed.has(idx)) return;

      // Find if this edge is shared with another room
      let isShared = false;
      let sharedWithWC = false;
      let sharedRoom = null;

      for (let j = 0; j < allEdges.length; j++) {
        if (j === idx || allEdges[j].roomId === edge.roomId) continue;
        if (edgesMatch(edge, allEdges[j])) {
          isShared = true;
          processed.add(j);
          sharedRoom = allEdges[j];
          if (allEdges[j].roomLayer === "room_wc" || edge.roomLayer === "room_wc") {
            sharedWithWC = true;
          }
          break;
        }
      }

      let wallType, wallLabel;
      if (isShared) {
        if (sharedWithWC) {
          wallType = "wall_wc";
          wallLabel = "Τοίχος WC";
        } else {
          wallType = "wall_int";
          wallLabel = "Εσωτ. τοίχος";
        }
      } else {
        // Check if this edge is on the periphery (balcony edges are not ext walls)
        if (edge.roomLayer === "balcony" || edge.roomLayer === "terrace" || edge.roomLayer === "parking") {
          return; // Skip non-building edges
        }
        wallType = "wall_ext";
        wallLabel = "Εξωτ. τοίχος";
      }

      // Calculate edge length in meters
      const lenPx = Math.hypot(edge.p2.x - edge.p1.x, edge.p2.y - edge.p1.y);
      const lenM = px2m(lenPx);

      // Skip very short edges (likely artifacts)
      if (lenM < 0.3) return;

      newWalls.push({
        id: uid(),
        type: "line",
        layer: wallType,
        points: [{ x: edge.p1.x, y: edge.p1.y }, { x: edge.p2.x, y: edge.p2.y }],
        label: wallLabel + " (" + fmt(lenM) + "m)",
      });

      processed.add(idx);
    });

    // Estimate openings: for each external wall > 1.5m, assume a window or door
    const openings = [];
    const extWalls = newWalls.filter(w => w.layer === "wall_ext");
    extWalls.forEach(w => {
      const lenM = px2m(Math.hypot(w.points[1].x - w.points[0].x, w.points[1].y - w.points[0].y));
      if (lenM >= 2.5) {
        // Assume a sliding door in the middle third
        const t1 = 0.33, t2 = 0.67;
        openings.push({
          id: uid(), type: "line", layer: "opening_sliding",
          points: [
            { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * t1), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * t1) },
            { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * t2), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * t2) },
          ],
          label: "Συρόμενο (εκτ.)",
        });
      } else if (lenM >= 1.5) {
        // Assume a window in the middle
        const t1 = 0.3, t2 = 0.7;
        openings.push({
          id: uid(), type: "line", layer: "opening_window",
          points: [
            { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * t1), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * t1) },
            { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * t2), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * t2) },
          ],
          label: "Παράθυρο (εκτ.)",
        });
      }
    });

    // Add estimated doors for internal walls > 1m
    const intWalls = newWalls.filter(w => w.layer === "wall_int" || w.layer === "wall_wc");
    intWalls.forEach(w => {
      const lenM = px2m(Math.hypot(w.points[1].x - w.points[0].x, w.points[1].y - w.points[0].y));
      if (lenM >= 1.0) {
        // One door per internal wall
        const t1 = 0.1, t2 = 0.1 + (0.85 / lenM); // ~0.85m door
        if (t2 <= 1) {
          openings.push({
            id: uid(), type: "line", layer: "opening_door",
            points: [
              { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * t1), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * t1) },
              { x: Math.round(w.points[0].x + (w.points[1].x - w.points[0].x) * Math.min(t2, 0.9)), y: Math.round(w.points[0].y + (w.points[1].y - w.points[0].y) * Math.min(t2, 0.9)) },
            ],
            label: "Πόρτα (εκτ.)",
          });
        }
      }
    });

    pushUndo();
    setShapes(prev => [...prev, ...newWalls, ...openings]);
    setTool("select");
    setAiStatus("✓ " + newWalls.length + " τοίχοι + " + openings.length + " ανοίγματα (εκτίμηση). Σύρε για διόρθωση.");
    setTimeout(() => setAiStatus(""), 10000);
  };

  // ── Vertex Dragging ──
  const handleMouseDown = (e, shapeId, pointIdx) => {
    e.stopPropagation();
    e.preventDefault();
    pushUndo();
    setDragging({ shapeId, pointIdx });
    setSelectedId(shapeId);
  };

  // ── Add midpoint vertex ──
  const addMidpoint = (shapeId, edgeIdx) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== shapeId) return s;
      const p1 = s.points[edgeIdx];
      const p2 = s.points[(edgeIdx + 1) % s.points.length];
      const mid = { x: Math.round((p1.x + p2.x) / 2), y: Math.round((p1.y + p2.y) / 2) };
      const newPoints = [...s.points];
      newPoints.splice(edgeIdx + 1, 0, mid);
      return { ...s, points: newPoints };
    }));
  };

  // ── Delete vertex (min 3 for polygon, 2 for line) ──
  const deleteVertex = (shapeId, pointIdx) => {
    setShapes(prev => prev.map(s => {
      if (s.id !== shapeId) return s;
      const minPts = s.type === "polygon" ? 3 : 2;
      if (s.points.length <= minPts) return s;
      const newPoints = s.points.filter((_, i) => i !== pointIdx);
      return { ...s, points: newPoints };
    }));
  };

  const handleMouseMove = useCallback((e) => {
    if (!dragging) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
    setShapes(prev => prev.map(s => {
      if (s.id !== dragging.shapeId) return s;
      const newPoints = [...s.points];
      newPoints[dragging.pointIdx] = { x: pos.x, y: pos.y };
      return { ...s, points: newPoints };
    }));
  }, [dragging, zoom]);

  const handleMouseUp = useCallback(() => {
    if (dragging) setDragging(null);
  }, [dragging]);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // ── Pixel to Meters ──
  const px2m = useCallback((px) => pixelsPerMeter > 0 ? px / pixelsPerMeter : 0, [pixelsPerMeter]);

  // ── Polygon Area (Shoelace) ──
  const polyArea = useCallback((pts) => {
    if (pts.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y;
      a -= pts[j].x * pts[i].y;
    }
    return Math.abs(a / 2);
  }, []);

  // ── Line Length ──
  const lineLen = useCallback((pts) => {
    if (pts.length < 2) return 0;
    let len = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      len += Math.sqrt(dx * dx + dy * dy);
    }
    return len;
  }, []);

  // ── Cloud sync (Supabase via back/ API) ──────────────────────────────────
  // Pushes the active project's structured data (calibration + shapes) to the
  // backend. The image stays in local storage for now (multi-device image needs
  // Supabase Storage — a follow-up). Best-effort: stays usable offline.
  const buildCalibration = () => ({
    pixelsPerMeter, wallHeight, calLine, calMeters, calibrated, imgSize, customLayers,
  });
  const buildShapesPayload = () =>
    shapes.map((s) => {
      const area_px2 = s.type === "polygon" ? polyArea(s.points) : 0;
      return {
        kind: s.type, layer: s.layer, label: s.label || null, points: s.points,
        area_px2, area_m2: area_px2 ? px2m(Math.sqrt(area_px2)) ** 2 : null,
      };
    });

  const cloudSaveActive = async () => {
    if (!activeProjectId) return;
    const proj = projects.find((p) => p.id === activeProjectId);
    if (!proj) return;
    const calibration = buildCalibration();
    try {
      let cloudId = cloudIdRef.current[activeProjectId];
      if (!cloudId) {
        const res = await fetch(BACKEND_URL + "/projects", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: proj.name, calibration }),
        });
        if (!res.ok) throw new Error("HTTP " + res.status);
        cloudId = (await res.json()).id;
        cloudIdRef.current[activeProjectId] = cloudId;
      } else {
        await fetch(BACKEND_URL + "/projects/" + cloudId, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: proj.name, calibration }),
        });
      }
      await fetch(BACKEND_URL + "/projects/" + cloudId + "/shapes", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shapes: buildShapesPayload() }),
      });
      // Upload the floor-plan image to Supabase Storage (once per change).
      if (image && image.startsWith("data:") && imageUploadedRef.current[cloudId] !== image) {
        try {
          const blob = await (await fetch(image)).blob();
          const fd = new FormData();
          fd.append("file", blob, "plan.png");
          await fetch(BACKEND_URL + "/projects/" + cloudId + "/image", { method: "POST", body: fd });
          imageUploadedRef.current[cloudId] = image;
        } catch {}
      }
      setCloudStatus("☁️ συγχρονίστηκε");
    } catch {
      setCloudStatus("☁️ offline");
    }
    setTimeout(() => setCloudStatus(""), 4000);
  };

  const cloudLoadList = async () => {
    try {
      const res = await fetch(BACKEND_URL + "/projects");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const cloud = await res.json();
      setProjects((prev) => {
        const known = new Set(Object.values(cloudIdRef.current));
        const imported = cloud
          .filter((c) => !known.has(c.id))
          .map((c) => {
            const cal = c.calibration || {};
            const localId = uid();
            cloudIdRef.current[localId] = c.id;
            return {
              id: localId, name: c.name + " (cloud)", image: null,
              imgSize: cal.imgSize || { w: 0, h: 0 },
              calibrated: cal.calibrated || false, calLine: cal.calLine || null,
              calMeters: cal.calMeters || "", pixelsPerMeter: cal.pixelsPerMeter || 0,
              shapes: [], wallHeight: cal.wallHeight || WALL_HEIGHT,
              customLayers: cal.customLayers || [], _cloudId: c.id,
              createdAt: Date.now(), updatedAt: Date.now(),
            };
          });
        return [...prev, ...imported];
      });
      setCloudStatus("☁️ φορτώθηκαν από cloud");
    } catch {
      setCloudStatus("☁️ offline");
    }
    setTimeout(() => setCloudStatus(""), 4000);
  };

  // Debounced auto-push of structured data when it changes.
  useEffect(() => {
    if (!activeProjectId || loading) return;
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(() => { cloudSaveActive(); }, 1500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, calibrated, pixelsPerMeter, wallHeight, customLayers, calMeters, activeProjectId]);

  // ── Mouse position relative to image ──
  const getPos = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / zoom - pan.x / zoom,
      y: (e.clientY - rect.top) / zoom - pan.y / zoom,
    };
  };

  // ── Undo snapshot ──
  const pushUndo = useCallback(() => {
    setHistory(prev => {
      const next = [...prev, JSON.stringify(shapes)];
      return next.length > MAX_UNDO ? next.slice(-MAX_UNDO) : next;
    });
  }, [shapes]);

  const undo = useCallback(() => {
    setHistory(prev => {
      if (prev.length === 0) return prev;
      const newHist = [...prev];
      const last = newHist.pop();
      try { setShapes(JSON.parse(last)); } catch {}
      setSelectedId(null);
      setCurrentPoints([]);
      return newHist;
    });
  }, []);

  // ── Ortho snap: constrain point to 0/90/180/270° from last point ──
  const snapOrtho = useCallback((pos) => {
    if (!orthoMode || currentPoints.length === 0) return pos;
    const last = currentPoints[currentPoints.length - 1];
    const dx = Math.abs(pos.x - last.x);
    const dy = Math.abs(pos.y - last.y);
    // Snap to the dominant axis
    if (dx > dy) {
      return { x: pos.x, y: last.y }; // horizontal
    } else {
      return { x: last.x, y: pos.y }; // vertical
    }
  }, [orthoMode, currentPoints]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undo();
        return;
      }
      // Shift toggle ortho while held
      if (e.key === "Shift" && e.type === "keydown") {
        setOrthoMode(true);
      }
      // Delete selected
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && tool === "select") {
        e.preventDefault();
        pushUndo();
        setShapes(prev => prev.filter(s => s.id !== selectedId));
        setSelectedId(null);
      }
      // Escape cancel drawing
      if (e.key === "Escape") {
        setCurrentPoints([]);
        setSelectedId(null);
      }
    };
    const upHandler = (e) => {
      if (e.key === "Shift") setOrthoMode(false);
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    return () => { window.removeEventListener("keydown", handler); window.removeEventListener("keyup", upHandler); };
  }, [undo, selectedId, tool, pushUndo]);

  // ── Canvas Click ──
  const handleCanvasClick = (e) => {
    let pos = getPos(e);

    if (tool === "calibrate") {
      if (!calLine) {
        setCalLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
      } else if (calLine.x2 === calLine.x1 && calLine.y2 === calLine.y1) {
        setCalLine({ ...calLine, x2: pos.x, y2: pos.y });
      } else {
        setCalLine({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
      }
      return;
    }

    if (tool === "select") {
      const clicked = shapes.find((s) => {
        if (s.type === "polygon") return pointInPolygon(pos, s.points);
        return s.points.some((p) => Math.hypot(p.x - pos.x, p.y - pos.y) < 10 / zoom);
      });
      setSelectedId(clicked?.id || null);
      return;
    }

    if (tool === "polygon" || tool === "line") {
      // Apply ortho snap
      pos = snapOrtho(pos);
      setCurrentPoints([...currentPoints, pos]);
    }
  };

  // ── Double Click to finish shape ──
  const handleDoubleClick = () => {
    if (currentPoints.length < 2) return;
    const layer = LAYER_TYPES.find((l) => l.id === activeLayer);
    const type = layer?.calcType === "area" ? "polygon" : "line";

    if (type === "polygon" && currentPoints.length < 3) return;

    pushUndo();
    const shape = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      type,
      layer: activeLayer,
      points: [...currentPoints],
      label: layer?.label || "",
    };
    setShapes([...shapes, shape]);
    setCurrentPoints([]);
  };

  // ── Delete shape ──
  const deleteShape = (id) => {
    pushUndo();
    setShapes(shapes.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // ── Point in polygon ──
  const pointInPolygon = (point, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      if (((yi > point.y) !== (yj > point.y)) && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  };

  // ── Calculate Quantities ──
  const quantities = useCallback(() => {
    const q = {};
    LAYER_TYPES.forEach((lt) => { q[lt.id] = { items: [], totalM2: 0, totalM: 0, count: 0 }; });

    shapes.forEach((s) => {
      const lt = LAYER_TYPES.find((l) => l.id === s.layer);
      if (!lt) return;

      if (s.type === "polygon") {
        const areaPx = polyArea(s.points);
        const areaM2 = px2m(Math.sqrt(areaPx)) ** 2;
        const perimPx = lineLen([...s.points, s.points[0]]);
        const perimM = px2m(perimPx);
        q[s.layer].items.push({ id: s.id, label: s.label, areaM2, perimM });
        q[s.layer].totalM2 += areaM2;
        q[s.layer].totalM += perimM;
        q[s.layer].count++;
      } else {
        const lenPx = lineLen(s.points);
        const lenM = px2m(lenPx);
        q[s.layer].items.push({ id: s.id, label: s.label, lenM });
        q[s.layer].totalM += lenM;
        q[s.layer].count++;
      }
    });

    return q;
  }, [shapes, polyArea, lineLen, px2m]);

  // ── Derive Construction Quantities ──
  const deriveQuantities = useCallback(() => {
    const q = quantities();
    const h = wallHeight;
    const results = [];
    // Unit price from the catalog (code) if available, else the indicative fallback.
    const P = (code, fb) => (code && catPrices[code] != null ? Number(catPrices[code]) : fb);
    const push = (sec, desc, qty, unit, code, fb) =>
      results.push({ sec, desc, qty, unit, code: code || null, price: P(code, fb) });

    // Floor areas
    const intArea = q.room_internal.totalM2 + q.room_kitchen.totalM2;
    const wcArea = q.room_wc.totalM2;
    const balcArea = q.balcony.totalM2;
    const terrArea = q.terrace.totalM2;
    const parkArea = q.parking.totalM2;
    const totalFootprint = intArea + wcArea;

    if (intArea > 0) push("6. Πλακίδια", "Πλακίδια δαπέδου εσωτερικά", intArea, "m²", "PLA-01", 18);
    if (wcArea > 0) push("6. Πλακίδια", "Πλακίδια δαπέδου WC", wcArea, "m²", "PLA-01", 18);
    if (balcArea > 0) push("6. Πλακίδια", "Πλακίδια δαπέδου μπαλκονιών", balcArea, "m²", "PLA-01", 20);
    if (terrArea > 0) push("8. Στεγανοποίηση", "Θερμομόνωση/στεγανοποίηση ταράτσας", terrArea, "m²", "MON-02", 42);
    if (parkArea > 0) push("6. Πλακίδια", "Κυβόλιθοι parking", parkArea, "m²", null, 11);

    // Ceilings
    if (intArea > 0) push("4. Ξηρά Δόμηση", "Ψευδοροφή (σαλόνι/τραπεζαρία/υπνοδ.)", intArea * 0.6, "m²", "GYP-04", 23);
    if (wcArea > 0) push("4. Ξηρά Δόμηση", "Ψευδοροφή ανθυγρή (WC)", wcArea, "m²", "GYP-05", 28);

    // Painting
    const intWallArea = q.room_internal.totalM * h + q.room_kitchen.totalM * h;
    const intCeilingArea = intArea;
    if (intWallArea > 0) push("7. Χρωματισμοί", "Χρωματισμοί εσωτερικοί (τοίχοι)", intWallArea, "m²", "XRO-01", 12);
    if (intCeilingArea > 0) push("7. Χρωματισμοί", "Χρωματισμοί εσωτερικοί (οροφές)", intCeilingArea, "m²", "XRO-01", 12);

    // WC wall tiles
    const wcPerim = q.room_wc.totalM;
    if (wcPerim > 0) push("6. Πλακίδια", "Πλακίδια τοίχων WC (ύψος 2.40m)", wcPerim * TILE_HEIGHT_WC, "m²", "PLA-02", 18);

    // Walls
    const extWallLen = q.wall_ext.totalM;
    const intWallLen = q.wall_int.totalM;
    const wcWallLen = q.wall_wc.totalM;
    if (extWallLen > 0) push("3. Τοιχοποιία", "Εξωτερική διπλή τοιχοποιία", extWallLen * h, "m²", "TOI-01", 40);
    if (intWallLen > 0) push("4. Ξηρά Δόμηση", "Χώρισμα γυψοσανίδα (1+1)", intWallLen * h, "m²", "GYP-01", 24);
    if (wcWallLen > 0) push("4. Ξηρά Δόμηση", "Χώρισμα WC ανθυγρή (Κ+Α)", wcWallLen * h, "m²", "GYP-03", 28);

    // Insulation on ext walls
    if (extWallLen > 0) {
      const openingArea = (q.opening_door.totalM + q.opening_window.totalM + q.opening_sliding.totalM) * 2.20;
      const extWallArea = extWallLen * h - openingArea;
      if (extWallArea > 0) push("5. Θερμομόνωση", "ETICS εξωτερική θερμομόνωση", Math.max(0, extWallArea), "m²", "MON-01", 42);
    }

    // Openings (per piece — catalog κουφωμάτων είναι ανά m², οπότε εδώ ενδεικτικές ανά τεμ.)
    const doors = q.opening_door.count;
    const windows = q.opening_window.count;
    const sliding = q.opening_sliding.count;
    if (doors > 0) push("13. Ξυλουργικά", "Εσωτερικές πόρτες MDF", doors, "τεμ", "KOU-07", 380);
    if (windows > 0) push("12. Κουφώματα", "Ανοιγόμενα παράθυρα", windows, "τεμ", "KOU-10", 450);
    if (sliding > 0) push("12. Κουφώματα", "Συρόμενα κουφώματα + σίτα", sliding, "τεμ", "KOU-11", 1510);

    // Skirting
    const skirtLen = q.room_internal.totalM + q.room_kitchen.totalM;
    if (skirtLen > 0) push("6. Πλακίδια", "Σοβατεπί", skirtLen, "m", "PLA-06", 3);

    // Concrete slab
    if (totalFootprint > 0) push("2. Σκυρόδεμα", "Πλάκα Ο/Σ (εμβαδόν κάτοψης)", totalFootprint, "m²", null, 0);

    // Foundation waterproofing
    if (totalFootprint > 0) push("8. Στεγανοποίηση", "Στεγανοποίηση θεμελίωσης", totalFootprint, "m²", "MON-06", 18);

    // Plumbing points
    const wcCount = q.room_wc.count;
    const kitCount = q.room_kitchen.count;
    if (wcCount > 0) push("9. Ύδρευση", "Σημεία ύδρευσης WC (≈5 ανά WC)", wcCount * 5, "σημ.", "YDR-03", 110);
    if (kitCount > 0) push("9. Ύδρευση", "Σημεία ύδρευσης κουζίνα (≈3)", kitCount * 3, "σημ.", "YDR-03", 110);

    // Electrical
    if (totalFootprint > 0) push("10. Ηλεκτρολογικά", "Ηλεκτρολογική εγκατάσταση (κατ' εκτίμηση)", totalFootprint, "m²", "ILE-01", 95);

    // AC points
    const roomCount = q.room_internal.count;
    if (roomCount > 0) push("11. Κλιματισμός", "Σημεία A/C (≈1 ανά χώρο)", roomCount + kitCount, "σημ.", "THE-07", 470);

    return results;
  }, [quantities, wallHeight, catPrices]);

  // ── Export JSON ──
  const exportJSON = () => {
    const dq = deriveQuantities();
    const sections = {};
    dq.forEach((item) => {
      if (!sections[item.sec]) sections[item.sec] = [];
      sections[item.sec].push({ description: item.desc, quantity: Math.round(item.qty * 100) / 100, unit: item.unit, unitPrice: item.price });
    });

    const output = {
      exportType: "floorplan-takeoff",
      calibration: { pixelsPerMeter, wallHeight },
      timestamp: new Date().toISOString(),
      sections: Object.entries(sections).map(([name, items]) => ({ name, items })),
      rawMeasurements: quantities(),
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "takeoff-quantities.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Create a priced offer in Supabase from the derived quantities (Phase 1) ──
  const createOfferFromTakeoff = async () => {
    const dq = deriveQuantities();
    if (!dq.length) { setCloudStatus("Δεν υπάρχουν ποσότητες ακόμα"); setTimeout(() => setCloudStatus(""), 4000); return; }
    const bySec = {};
    dq.forEach((it) => {
      (bySec[it.sec] = bySec[it.sec] || []).push({
        description: it.desc, quantity: Math.round(it.qty * 100) / 100, unit: it.unit, unit_price: it.price,
      });
    });
    const sections = Object.entries(bySec).map(([name, items]) => ({ name, items }));
    const proj = projects.find((p) => p.id === activeProjectId);
    try {
      const res = await fetch(BACKEND_URL + "/offers/from-project", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: proj?.name || "Προσφορά", project_id: cloudIdRef.current[activeProjectId] || null, sections }),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      setCloudStatus("✓ Προσφορά δημιουργήθηκε (" + String(j.offer_id).slice(0, 8) + "). Άνοιξέ την στο Τεύχος Builder.");
    } catch {
      setCloudStatus("✗ Backend — τρέχει ο server;");
    }
    setTimeout(() => setCloudStatus(""), 8000);
  };

  // ── Render ──
  const layerInfo = LAYER_TYPES.find((l) => l.id === activeLayer);
  const activeProject = projects.find(p => p.id === activeProjectId);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#f5f0e8" }}>
      <p style={{ fontFamily: "'Cormorant Garamond',serif", color: "#8B7355", fontSize: 18 }}>Φόρτωση...</p>
    </div>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`::selection{background:#8B7355;color:#fff}input:focus{border-color:#8B7355!important}`}</style>

      {/* HEADER */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view === "canvas" && <button style={{ background: "none", border: "none", color: "#f5f0e8", cursor: "pointer", fontSize: 16, padding: "4px 8px" }} onClick={() => { saveCurrentToProject(); setView("projects"); }}>←</button>}
          <div style={S.logo}>📐</div>
          <div>
            <h1 style={S.h1}>{view === "canvas" && activeProject ? activeProject.name : "Floor Plan Takeoff"}</h1>
            <p style={S.sub}>{view === "canvas" ? "Μετρήσεις αποθηκεύονται αυτόματα" : "Εξαγωγή ποσοτήτων από κάτοψη"}</p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {saving && <span style={S.badge}>💾 Saving...</span>}
          {calibrated && view === "canvas" && <span style={S.badge}>✓ 1px = {(1 / pixelsPerMeter * 100).toFixed(2)}cm</span>}
          {shapes.length > 0 && view === "canvas" && <button style={S.exportBtn} onClick={() => setShowExport(!showExport)}>📊 Ποσότητες ({shapes.length})</button>}
          {shapes.length > 0 && view === "canvas" && <button style={S.exportBtn} onClick={exportJSON}>💾 Export</button>}
        </div>
      </header>

      {/* PROJECTS LIST VIEW */}
      {view === "projects" && (
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, margin: 0, color: "#3a3028" }}>Τα Projects σου</h2>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {cloudStatus && <span style={{ fontSize: 12, color: "#16A085", fontWeight: 600 }}>{cloudStatus}</span>}
              <button style={{ ...S.primaryBtn, background: "#16A085" }} onClick={cloudLoadList}>☁️ Φόρτωση από Cloud</button>
              <button style={S.primaryBtn} onClick={() => createProject()}>+ Νέο Project</button>
            </div>
          </div>

          {projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: "#fff", borderRadius: 12, border: "2px dashed #ddd3c4" }}>
              <p style={{ fontSize: 48, margin: "0 0 8px" }}>📐</p>
              <h3 style={{ fontFamily: "'Cormorant Garamond',serif", color: "#5a4a3a", margin: "0 0 8px" }}>Κανένα project ακόμα</h3>
              <p style={{ color: "#8B7355", marginBottom: 20, fontSize: 14 }}>Δημιούργησε ένα νέο project και ανέβασε κάτοψη.</p>
              <button style={S.primaryBtn} onClick={() => createProject()}>+ Ξεκίνα</button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 }}>
              {projects.map(p => (
                <div key={p.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e0d4", overflow: "hidden", cursor: "pointer", transition: "all .2s" }} onClick={() => loadProject(p)}>
                  {/* Thumbnail */}
                  <div style={{ height: 140, background: "#ede8df", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {p.image ? <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.7 }} /> : <span style={{ fontSize: 48, opacity: 0.3 }}>📐</span>}
                  </div>
                  <div style={{ padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 16, margin: 0, color: "#3a3028" }}>{p.name}</h3>
                      <button style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 14, padding: 2 }} onClick={(e) => { e.stopPropagation(); deleteProject(p.id); }}>🗑</button>
                    </div>
                    <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#8B7355" }}>
                      <span>{p.shapes?.length || 0} σχήματα</span>
                      <span>•</span>
                      <span>{p.calibrated ? "✓ Calibrated" : "⚠ No scale"}</span>
                    </div>
                    <p style={{ fontSize: 10, color: "#aaa", margin: "6px 0 0" }}>{new Date(p.updatedAt || p.createdAt).toLocaleDateString("el-GR")} {new Date(p.updatedAt || p.createdAt).toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CANVAS VIEW */}
      {view === "canvas" && (
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* LEFT TOOLBAR */}
        <div style={S.toolbar}>
          {!image ? (
            <label style={S.uploadBox}>
              <span style={{ fontSize: 36 }}>📁</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Ανέβασε Κάτοψη</span>
              <span style={{ fontSize: 11, color: "#8B7355" }}>PNG, JPG ή PDF</span>
              <input type="file" accept="image/*,.pdf" style={{ display: "none" }} onChange={handleImageUpload} />
            </label>
          ) : (
            <>
              {/* Tools */}
              <div style={S.toolSection}>
                <p style={S.toolLabel}>Εργαλεία</p>
                {[
                  { id: "select", icon: "👆", label: "Επιλογή" },
                  { id: "calibrate", icon: "📏", label: "Calibration" },
                  { id: "polygon", icon: "⬡", label: "Επιφάνεια" },
                  { id: "line", icon: "╱", label: "Γραμμή/Τοίχος" },
                ].map((t) => (
                  <button key={t.id} style={{ ...S.toolBtn, ...(tool === t.id ? S.toolActive : {}) }} onClick={() => { setTool(t.id); setCurrentPoints([]); }}>
                    <span>{t.icon}</span> {t.label}
                  </button>
                ))}
                {/* Undo */}
                <button style={{ ...S.toolBtn, marginTop: 4, opacity: history.length === 0 ? 0.4 : 1 }} onClick={undo} disabled={history.length === 0}>
                  <span>↩️</span> Undo {history.length > 0 ? `(${history.length})` : ""}
                </button>
                {/* Ortho Toggle */}
                <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 11, color: orthoMode ? "#8B7355" : "#999", cursor: "pointer", marginTop: 4, background: orthoMode ? "#f5f0e8" : "transparent", borderRadius: 6, border: orthoMode ? "1px solid #ddd3c4" : "1px solid transparent" }}>
                  <input type="checkbox" checked={orthoMode} onChange={e => setOrthoMode(e.target.checked)} style={{ accentColor: "#8B7355" }} />
                  📐 Κάθετο (90°) {!orthoMode && <span style={{ fontSize: 9, color: "#bbb" }}>ή Shift</span>}
                </label>
              </div>

              {/* Calibration */}
              {tool === "calibrate" && (
                <div style={S.toolSection}>
                  <p style={S.toolLabel}>📏 Calibration</p>
                  <p style={{ fontSize: 11, color: "#8B7355", margin: "0 0 8px" }}>Κάνε κλικ σε 2 σημεία πάνω σε γνωστή διάσταση</p>
                  <input style={S.input} type="number" step="0.01" placeholder="Μέτρα (π.χ. 4.20)" value={calMeters} onChange={(e) => setCalMeters(e.target.value)} />
                  <button style={S.primaryBtn} onClick={doCalibrate} disabled={!calLine || !calMeters}>✓ Εφαρμογή Scale</button>
                </div>
              )}

              {/* Backend Detection (local back/ API) */}
              {image && (
                <div style={S.toolSection}>
                  <p style={S.toolLabel}>🖥️ Backend Αναγνώριση (local)</p>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <button style={{ ...S.layerBtn, flex: 1, justifyContent: "center", fontWeight: engine === "classical" ? 700 : 400, background: engine === "classical" ? "#16A08518" : undefined }} onClick={() => setEngine("classical")}>Classical CV</button>
                    <button style={{ ...S.layerBtn, flex: 1, justifyContent: "center", fontWeight: engine === "cubicasa" ? 700 : 400, background: engine === "cubicasa" ? "#2E86AB18" : undefined }} onClick={() => setEngine("cubicasa")}>CubiCasa</button>
                  </div>
                  <button style={{ ...S.primaryBtn, background: detecting ? "#aaa" : "#16A085", opacity: detecting ? 0.7 : 1 }} onClick={autoDetectBackend} disabled={detecting}>
                    {detecting ? "⏳ Αναγνώριση..." : "🔍 Αναγνώριση από Backend"}
                  </button>
                  <p style={{ fontSize: 9, color: "#8B7355", margin: "4px 0 0", lineHeight: 1.3 }}>
                    Πρόχειρο — διόρθωσε χειροκίνητα.{!calibrated && " Κάνε calibration για m²."}
                  </p>
                  {aiStatus && (
                    <p style={{ fontSize: 10, color: aiStatus.startsWith("✓") ? "#27ae60" : aiStatus.startsWith("✗") ? "#c0392b" : "#8B7355", margin: "6px 0 0", lineHeight: 1.4, fontWeight: 600 }}>{aiStatus}</p>
                  )}
                </div>
              )}

              {/* AI Auto-Detect */}
              {calibrated && (
                <div style={S.toolSection}>
                  <p style={S.toolLabel}>🤖 AI Αναγνώριση</p>
                  <button style={{ ...S.primaryBtn, background: detecting ? "#aaa" : "#2E86AB", opacity: detecting ? 0.7 : 1, marginBottom: 4 }} onClick={autoDetect} disabled={detecting}>
                    {detecting ? "⏳ Αναγνώριση χώρων..." : "🏠 Αναγνώριση Χώρων"}
                  </button>
                  <button style={{ ...S.primaryBtn, background: shapes.filter(s=>s.type==="polygon").length === 0 ? "#aaa" : "#C0392B", marginBottom: 4 }} onClick={autoDetectWalls} disabled={shapes.filter(s=>s.type==="polygon").length === 0}>
                    🧱 Εξαγωγή Τοίχων {shapes.filter(s=>s.type==="polygon").length === 0 ? "(πρώτα χώρους)" : ""}
                  </button>
                  <button style={{ ...S.primaryBtn, background: detecting ? "#aaa" : "#27AE60", opacity: detecting ? 0.7 : 1 }} onClick={async () => { await autoDetect(); setTimeout(() => autoDetectWalls(), 500); }} disabled={detecting}>
                    {detecting ? "⏳ Αναγνώριση..." : "⚡ Πλήρης Αναγνώριση"}
                  </button>
                  {aiStatus && !detecting && (
                    <p style={{ fontSize: 10, color: aiStatus.startsWith("✓") ? "#27ae60" : aiStatus.startsWith("✗") ? "#c0392b" : "#8B7355", margin: "6px 0 0", lineHeight: 1.4, fontWeight: 600 }}>
                      {aiStatus}
                    </p>
                  )}
                  {detecting && (
                    <p style={{ fontSize: 10, color: "#2E86AB", margin: "6px 0 0", lineHeight: 1.4 }}>
                      {aiStatus}
                    </p>
                  )}
                  <p style={{ fontSize: 9, color: "#bbb", margin: "6px 0 0", lineHeight: 1.4 }}>Σύρε κορυφές/άκρα για διόρθωση μετά.</p>
                </div>
              )}

              {/* Layers */}
              {calibrated && (tool === "polygon" || tool === "line") && (
                <div style={S.toolSection}>
                  <p style={S.toolLabel}>Layers</p>
                  {LAYER_TYPES.filter((l) => (tool === "polygon" ? l.calcType === "area" : l.calcType === "line")).map((l) => (
                    <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                      <button style={{ ...S.layerBtn, flex: 1, borderLeftColor: l.color, ...(activeLayer === l.id ? { background: l.color + "18", fontWeight: 700 } : {}) }} onClick={() => setActiveLayer(l.id)}>
                        <span>{l.icon}</span> {l.label}
                      </button>
                      {l.custom && (
                        <button style={{ background: "none", border: "none", color: "#ccc", cursor: "pointer", fontSize: 11, padding: "2px 4px" }} onClick={() => setCustomLayers(prev => prev.filter(cl => cl.id !== l.id))} title="Αφαίρεση">×</button>
                      )}
                    </div>
                  ))}
                  {/* Add new layer */}
                  {!showAddLayer ? (
                    <button style={{ ...S.layerBtn, borderLeftColor: "#aaa", color: "#aaa", fontStyle: "italic", fontSize: 10 }} onClick={() => setShowAddLayer(true)}>
                      + Νέο Layer...
                    </button>
                  ) : (
                    <div style={{ background: "#faf8f4", borderRadius: 6, padding: 8, marginTop: 4, border: "1px solid #e8e0d4" }}>
                      <input style={{ ...S.input, fontSize: 11, marginBottom: 4 }} placeholder="Όνομα (π.χ. Αποθήκη)" value={newLayerName} onChange={(e) => setNewLayerName(e.target.value)} autoFocus />
                      <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                          <input type="radio" name="lt" checked={newLayerType === "area"} onChange={() => setNewLayerType("area")} style={{ accentColor: "#8B7355" }} /> Επιφάνεια
                        </label>
                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3, cursor: "pointer" }}>
                          <input type="radio" name="lt" checked={newLayerType === "line"} onChange={() => setNewLayerType("line")} style={{ accentColor: "#8B7355" }} /> Γραμμή
                        </label>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button style={{ ...S.primaryBtn, fontSize: 10, padding: "4px 10px", flex: 1 }} onClick={() => {
                          if (!newLayerName.trim()) return;
                          const color = CUSTOM_COLORS[customLayers.length % CUSTOM_COLORS.length];
                          const newL = { id: "custom_" + uid(), label: newLayerName.trim(), color, icon: newLayerType === "area" ? "📦" : "━", calcType: newLayerType, custom: true };
                          setCustomLayers(prev => [...prev, newL]);
                          setActiveLayer(newL.id);
                          setNewLayerName("");
                          setShowAddLayer(false);
                        }}>✓ Προσθήκη</button>
                        <button style={{ background: "none", border: "1px solid #ddd", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 10 }} onClick={() => { setShowAddLayer(false); setNewLayerName(""); }}>✗</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Wall Height */}
              {calibrated && (
                <div style={S.toolSection}>
                  <p style={S.toolLabel}>Ύψος ορόφου</p>
                  <input style={S.input} type="number" step="0.05" value={wallHeight} onChange={(e) => setWallHeight(parseFloat(e.target.value) || 2.80)} />
                  <span style={{ fontSize: 10, color: "#aaa" }}>μέτρα</span>
                </div>
              )}

              {/* Instructions */}
              <div style={{ ...S.toolSection, background: "#faf8f4", borderRadius: 8, padding: 12, marginTop: "auto" }}>
                <p style={{ fontSize: 11, color: "#8B7355", margin: 0, lineHeight: 1.5 }}>
                  {tool === "calibrate" && "Κλικ σε 2 σημεία → βάλε μέτρα → Εφαρμογή"}
                  {tool === "polygon" && ("Κλικ κορυφές → Διπλό κλικ κλείσιμο" + (orthoMode ? " • 📐 ON" : " • Shift=κάθετο"))}
                  {tool === "line" && ("Κλικ σημεία → Διπλό κλικ τέλος" + (orthoMode ? " • 📐 ON" : " • Shift=κάθετο"))}
                  {tool === "select" && "Σύρε ○ κορυφές • Del=διαγραφή • Ctrl+Z=undo"}
                </p>
              </div>

              {/* Selected shape controls */}
              {selectedId && (() => {
                const sel = shapes.find(s => s.id === selectedId);
                if (!sel) return null;
                const lt = LAYER_TYPES.find(l => l.id === sel.layer);
                return (
                  <div style={{ ...S.toolSection, background: "#fff8f0", borderRadius: 8, padding: 12, border: `2px solid ${lt?.color || "#888"}` }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: lt?.color, margin: "0 0 6px" }}>{lt?.icon} {sel.label}</p>
                    <input style={{ ...S.input, fontSize: 12 }} value={sel.label} onChange={(e) => setShapes(prev => prev.map(s => s.id === selectedId ? { ...s, label: e.target.value } : s))} placeholder="Όνομα χώρου..." />
                    <select style={{ ...S.input, fontSize: 11 }} value={sel.layer} onChange={(e) => setShapes(prev => prev.map(s => s.id === selectedId ? { ...s, layer: e.target.value } : s))}>
                      {LAYER_TYPES.filter(l => l.calcType === sel.type).map(l => (
                        <option key={l.id} value={l.id}>{l.icon} {l.label}</option>
                      ))}
                    </select>
                    {sel.type === "polygon" && (
                      <p style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#5a4a3a", margin: "6px 0 0" }}>
                        📐 {fmt(px2m(Math.sqrt(polyArea(sel.points))) ** 2)} m²
                      </p>
                    )}
                    {sel.type === "polygon" && (
                      <p style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#5a4a3a", margin: "2px 0 0" }}>
                        📏 {fmt(px2m(lineLen([...sel.points, sel.points[0]])))} m περίμετρος
                      </p>
                    )}
                    {sel.type === "line" && (
                      <p style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#5a4a3a", margin: "6px 0 0" }}>
                        📏 {fmt(px2m(lineLen(sel.points)))} m
                      </p>
                    )}
                    <p style={{ fontSize: 10, color: "#999", margin: "4px 0" }}>
                      {sel.points.length} κορυφές • ○ σύρε • ◇ πρόσθεσε • 2×κλικ αφαίρεσε
                    </p>
                    <button style={{ ...S.toolBtn, color: "#c0392b", marginTop: 4, justifyContent: "center", fontSize: 11 }} onClick={() => { deleteShape(selectedId); setSelectedId(null); }}>🗑 Διαγραφή σχήματος</button>
                  </div>
                );
              })()}

              {/* New Image */}
              <label style={{ ...S.toolBtn, cursor: "pointer", marginTop: 8, textAlign: "center", justifyContent: "center" }}>
                📁 Νέα κάτοψη
                <input type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
              </label>
            </>
          )}
        </div>

        {/* CANVAS AREA */}
        <div ref={containerRef} style={S.canvasArea}>
          {image && (
            <div style={{ position: "relative", transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, transformOrigin: "0 0", cursor: tool === "select" ? "default" : "crosshair" }}>
              <img src={image} alt="Floor plan" style={{ display: "block", maxWidth: "none" }} ref={canvasRef} onClick={handleCanvasClick} onDoubleClick={handleDoubleClick} draggable={false} />

              {/* SVG Overlay */}
              <svg style={{ position: "absolute", top: 0, left: 0, width: imgSize.w, height: imgSize.h, pointerEvents: "none" }}>
                {/* Calibration line */}
                {calLine && (
                  <g>
                    <line x1={calLine.x1} y1={calLine.y1} x2={calLine.x2} y2={calLine.y2} stroke="#FF0" strokeWidth={2 / zoom} strokeDasharray={`${6 / zoom}`} />
                    <circle cx={calLine.x1} cy={calLine.y1} r={5 / zoom} fill="#FF0" />
                    <circle cx={calLine.x2} cy={calLine.y2} r={5 / zoom} fill="#FF0" />
                    {calibrated && (
                      <text x={(calLine.x1 + calLine.x2) / 2} y={(calLine.y1 + calLine.y2) / 2 - 10 / zoom} fill="#FF0" fontSize={14 / zoom} textAnchor="middle" fontWeight="bold">{calMeters}m</text>
                    )}
                  </g>
                )}

                {/* Shapes */}
                {shapes.map((s) => {
                  const lt = LAYER_TYPES.find((l) => l.id === s.layer);
                  const color = lt?.color || "#888";
                  const isSelected = s.id === selectedId;

                  if (s.type === "polygon") {
                    const pts = s.points.map((p) => `${p.x},${p.y}`).join(" ");
                    const areaPx = polyArea(s.points);
                    const areaM2 = px2m(Math.sqrt(areaPx)) ** 2;
                    const cx = s.points.reduce((a, p) => a + p.x, 0) / s.points.length;
                    const cy = s.points.reduce((a, p) => a + p.y, 0) / s.points.length;
                    return (
                      <g key={s.id}>
                        <polygon points={pts} fill={color + (isSelected ? "40" : "25")} stroke={color} strokeWidth={(isSelected ? 3 : 1.5) / zoom} />
                        <text x={cx} y={cy - 14 / zoom} fill={color} fontSize={11 / zoom} textAnchor="middle" fontWeight="bold">{s.label || lt?.icon}</text>
                        <text x={cx} y={cy + 4 / zoom} fill={color} fontSize={13 / zoom} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" fontWeight="bold">{fmt(areaM2)} m²</text>
                        <text x={cx} y={cy + 18 / zoom} fill={color} fontSize={9 / zoom} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" opacity="0.7">P: {fmt(px2m(lineLen([...s.points, s.points[0]])))}m</text>
                        {/* Draggable vertex handles — white circles */}
                        {s.points.map((p, pi) => (
                          <circle key={"v" + pi} cx={p.x} cy={p.y} r={6 / zoom} fill={dragging?.shapeId === s.id && dragging?.pointIdx === pi ? color : "#fff"} stroke={color} strokeWidth={2 / zoom} style={{ cursor: dragging ? "grabbing" : "grab", pointerEvents: "all" }} onMouseDown={(e) => handleMouseDown(e, s.id, pi)} onDoubleClick={(e) => { e.stopPropagation(); deleteVertex(s.id, pi); }} />
                        ))}
                        {/* Midpoint add handles — small diamonds on edges (only when selected) */}
                        {isSelected && s.points.map((p, pi) => {
                          const np = s.points[(pi + 1) % s.points.length];
                          const mx = (p.x + np.x) / 2;
                          const my = (p.y + np.y) / 2;
                          return (
                            <g key={"m" + pi} style={{ cursor: "cell", pointerEvents: "all" }} onClick={(e) => { e.stopPropagation(); addMidpoint(s.id, pi); }}>
                              <rect x={mx - 4 / zoom} y={my - 4 / zoom} width={8 / zoom} height={8 / zoom} rx={2 / zoom} fill={color} opacity={0.5} transform={`rotate(45 ${mx} ${my})`} />
                            </g>
                          );
                        })}
                        {/* Edge lengths when selected */}
                        {isSelected && s.points.map((p, pi) => {
                          const np = s.points[(pi + 1) % s.points.length];
                          const mx = (p.x + np.x) / 2;
                          const my = (p.y + np.y) / 2;
                          const len = px2m(Math.hypot(np.x - p.x, np.y - p.y));
                          return <text key={"e" + pi} x={mx} y={my - 8 / zoom} fill={color} fontSize={9 / zoom} textAnchor="middle" fontFamily="'JetBrains Mono',monospace" opacity="0.8">{fmt(len)}m</text>;
                        })}
                      </g>
                    );
                  } else {
                    const lenM = px2m(lineLen(s.points));
                    return (
                      <g key={s.id}>
                        <polyline points={s.points.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={color} strokeWidth={(isSelected ? 4 : 2.5) / zoom} strokeLinecap="round" />
                        {/* Draggable vertex handles */}
                        {s.points.map((p, i) => (
                          <circle key={"v" + i} cx={p.x} cy={p.y} r={6 / zoom} fill={dragging?.shapeId === s.id && dragging?.pointIdx === i ? color : (isSelected ? "#fff" : color)} stroke={color} strokeWidth={2 / zoom} style={{ cursor: dragging ? "grabbing" : "grab", pointerEvents: "all" }} onMouseDown={(e) => handleMouseDown(e, s.id, i)} onDoubleClick={(e) => { e.stopPropagation(); deleteVertex(s.id, i); }} />
                        ))}
                        {/* Midpoint handles for lines when selected */}
                        {isSelected && s.points.length >= 2 && s.points.slice(0, -1).map((p, pi) => {
                          const np = s.points[pi + 1];
                          const mx = (p.x + np.x) / 2;
                          const my = (p.y + np.y) / 2;
                          return (
                            <g key={"m" + pi} style={{ cursor: "cell", pointerEvents: "all" }} onClick={(e) => { e.stopPropagation(); addMidpoint(s.id, pi); }}>
                              <rect x={mx - 4 / zoom} y={my - 4 / zoom} width={8 / zoom} height={8 / zoom} rx={2 / zoom} fill={color} opacity={0.5} transform={`rotate(45 ${mx} ${my})`} />
                            </g>
                          );
                        })}
                        <text x={(s.points[0].x + s.points[s.points.length - 1].x) / 2} y={(s.points[0].y + s.points[s.points.length - 1].y) / 2 - 8 / zoom} fill={color} fontSize={11 / zoom} textAnchor="middle" fontFamily="'JetBrains Mono',monospace">{fmt(lenM)}m</text>
                      </g>
                    );
                  }
                })}

                {/* Current drawing */}
                {currentPoints.length > 0 && (
                  <g>
                    {tool === "polygon" && currentPoints.length > 1 && (
                      <polygon points={currentPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill={layerInfo?.color + "20" || "#88888820"} stroke={layerInfo?.color || "#888"} strokeWidth={1.5 / zoom} strokeDasharray={`${4 / zoom}`} />
                    )}
                    {(tool === "line" || (tool === "polygon" && currentPoints.length <= 1)) && currentPoints.length > 1 && (
                      <polyline points={currentPoints.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={layerInfo?.color || "#888"} strokeWidth={2 / zoom} strokeDasharray={`${4 / zoom}`} />
                    )}
                    {currentPoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={4 / zoom} fill={layerInfo?.color || "#888"} />
                    ))}
                  </g>
                )}
              </svg>
            </div>
          )}

          {!image && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#ccc3b4" }}>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22 }}>← Ανέβασε μια κάτοψη για να ξεκινήσεις</p>
            </div>
          )}

          {/* Zoom Controls */}
          {image && (
            <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", gap: 4 }}>
              <button style={S.zoomBtn} onClick={() => setZoom((z) => Math.min(z * 1.2, 5))}>+</button>
              <button style={S.zoomBtn} onClick={() => setZoom(1)}>⟲</button>
              <button style={S.zoomBtn} onClick={() => setZoom((z) => Math.max(z / 1.2, 0.2))}>−</button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL - Quantities */}
        {showExport && (
          <div style={S.rightPanel}>
            <h3 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 18, margin: "0 0 12px", color: "#3a3028" }}>📊 Υπολογισμός Ποσοτήτων</h3>

            {/* Raw Measurements */}
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8B7355", marginBottom: 6 }}>Μετρήσεις</p>
              {Object.entries(quantities()).filter(([_, v]) => v.count > 0).map(([layerId, v]) => {
                const lt = LAYER_TYPES.find((l) => l.id === layerId);
                return (
                  <div key={layerId} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #f0e8dc", fontSize: 12 }}>
                    <span style={{ color: lt?.color }}>{lt?.icon} {lt?.label}</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#5a4a3a" }}>
                      {v.totalM2 > 0 ? fmt(v.totalM2) + " m²" : ""} {v.totalM > 0 ? fmt(v.totalM) + " m" : ""} ({v.count})
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Derived Quantities */}
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8B7355", marginBottom: 6 }}>Εργασίες Τεύχους</p>
              {deriveQuantities().map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f0e8dc", fontSize: 11 }}>
                  <div>
                    <span style={{ color: "#8B7355", fontSize: 9 }}>{item.sec}</span><br />
                    <span style={{ color: "#3a3028" }}>{item.desc}</span>
                  </div>
                  <div style={{ textAlign: "right", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" }}>
                    <span style={{ color: "#5a4a3a" }}>{fmt(item.qty)} {item.unit}</span><br />
                    {item.price > 0 && <span style={{ color: "#8B7355", fontSize: 10 }}>≈ €{fmt(item.qty * item.price)}</span>}
                  </div>
                </div>
              ))}
              {deriveQuantities().length > 0 && (
                <div style={{ marginTop: 12, padding: "12px 0", borderTop: "2px solid #8B7355", textAlign: "right" }}>
                  <span style={{ fontSize: 10, color: "#8B7355", textTransform: "uppercase" }}>Εκτίμηση κόστους</span><br />
                  <span style={{ fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, color: "#3a3028" }}>
                    €{fmt(deriveQuantities().reduce((a, i) => a + i.qty * i.price, 0))}
                  </span>
                </div>
              )}
            </div>

            <button style={{ ...S.primaryBtn, width: "100%", marginTop: 12, justifyContent: "center" }} onClick={exportJSON}>💾 Export JSON για Τεύχος</button>
            <button style={{ ...S.primaryBtn, width: "100%", marginTop: 8, justifyContent: "center", background: "#16A085" }} onClick={createOfferFromTakeoff}>📋 Δημιουργία Προσφοράς (Cloud)</button>
            {cloudStatus && <p style={{ fontSize: 10, color: cloudStatus.startsWith("✓") ? "#27ae60" : cloudStatus.startsWith("✗") ? "#c0392b" : "#8B7355", margin: "8px 0 0", lineHeight: 1.4, fontWeight: 600 }}>{cloudStatus}</p>}
          </div>
        )}
      </div>
      )}

      {/* Shapes List (bottom bar) */}
      {view === "canvas" && shapes.length > 0 && !showExport && (
        <div style={S.shapesBar}>
          {shapes.map((s) => {
            const lt = LAYER_TYPES.find((l) => l.id === s.layer);
            return (
              <div key={s.id} style={{ ...S.shapeChip, borderColor: lt?.color, background: selectedId === s.id ? lt?.color + "20" : "#fff" }} onClick={() => setSelectedId(s.id)}>
                <span>{lt?.icon}</span>
                <span style={{ fontSize: 11 }}>{lt?.label}</span>
                {s.type === "polygon" && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{fmt(px2m(Math.sqrt(polyArea(s.points))) ** 2)}m²</span>}
                {s.type === "line" && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10 }}>{fmt(px2m(lineLen(s.points)))}m</span>}
                <button style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", fontSize: 12, padding: "0 2px" }} onClick={(e) => { e.stopPropagation(); deleteShape(s.id); }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const S = {
  app: { fontFamily: "'DM Sans',sans-serif", background: "#f5f0e8", minHeight: "100vh", color: "#3a3028", display: "flex", flexDirection: "column" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", background: "#3a3028", borderBottom: "3px solid #8B7355", flexShrink: 0 },
  logo: { width: 36, height: 36, borderRadius: 8, background: "#8B7355", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 },
  h1: { fontFamily: "'Cormorant Garamond',serif", fontSize: 20, margin: 0, color: "#f5f0e8", fontWeight: 600 },
  sub: { fontSize: 10, margin: 0, color: "#a09080", letterSpacing: 1, textTransform: "uppercase" },
  badge: { fontSize: 10, background: "rgba(255,255,255,0.1)", padding: "4px 12px", borderRadius: 20, color: "#a09080" },
  exportBtn: { background: "#8B7355", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" },

  toolbar: { width: 220, background: "#fff", borderRight: "1px solid #e8e0d4", padding: 14, display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flexShrink: 0 },
  toolSection: { marginBottom: 12 },
  toolLabel: { fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#8B7355", margin: "0 0 6px" },
  toolBtn: { display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "1px solid #e8e0d4", borderRadius: 6, background: "#faf8f4", cursor: "pointer", fontSize: 12, fontFamily: "'DM Sans',sans-serif", color: "#5a4a3a" },
  toolActive: { background: "#8B7355", color: "#fff", borderColor: "#8B7355" },
  layerBtn: { display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 10px", border: "none", borderLeft: "3px solid #ccc", borderRadius: 0, background: "transparent", cursor: "pointer", fontSize: 11, fontFamily: "'DM Sans',sans-serif", color: "#5a4a3a", marginBottom: 2 },
  input: { width: "100%", padding: "6px 10px", border: "1px solid #ddd3c4", borderRadius: 6, fontSize: 13, fontFamily: "'DM Sans',sans-serif", background: "#faf8f4", outline: "none", boxSizing: "border-box", marginBottom: 6 },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 12px", background: "#8B7355", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" },
  uploadBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 30, border: "2px dashed #ddd3c4", borderRadius: 12, cursor: "pointer", textAlign: "center", color: "#5a4a3a" },

  canvasArea: { flex: 1, overflow: "auto", position: "relative", background: "#e8e0d4" },
  zoomBtn: { width: 32, height: 32, borderRadius: 6, background: "#3a3028", color: "#f5f0e8", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700 },

  rightPanel: { width: 300, background: "#fff", borderLeft: "1px solid #e8e0d4", padding: 16, overflowY: "auto", flexShrink: 0 },

  shapesBar: { display: "flex", gap: 6, padding: "8px 14px", background: "#fff", borderTop: "1px solid #e8e0d4", overflowX: "auto", flexShrink: 0 },
  shapeChip: { display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", border: "1px solid #ddd", borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap", fontSize: 11 },
};
