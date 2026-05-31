import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "offers-data";

// Default structure for a new offer
const createNewOffer = (name = "New Offer") => ({
  id: Date.now().toString(),
  name,
  client: "",
  project: "",
  date: new Date().toISOString().split("T")[0],
  sections: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const createNewSection = (name = "New Section") => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
  name,
  items: [],
  collapsed: false,
});

const createNewItem = () => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
  description: "",
  quantity: 0,
  unit: "pcs",
  unitPrice: 0,
  notes: "",
});

const UNITS = ["pcs", "m", "m²", "m³", "kg", "lt", "hrs", "days", "sets", "lm", "€"];

// ─── Formatters ────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);

const fmtNum = (n) =>
  new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── Icons (inline SVG) ────────────────────────────────────
const Icon = ({ d, size = 18, color = "currentColor", ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);

const PlusIcon = (p) => <Icon d="M12 5v14M5 12h14" {...p} />;
const TrashIcon = (p) => <Icon d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...p} />;
const ChevronDown = (p) => <Icon d="M6 9l6 6 6-6" {...p} />;
const ChevronRight = (p) => <Icon d="M9 18l6-6-6-6" {...p} />;
const SaveIcon = (p) => <Icon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" {...p} />;
const CopyIcon = (p) => <Icon d="M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" {...p} />;
const FileIcon = (p) => <Icon d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6" {...p} />;
const EditIcon = (p) => <Icon d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" {...p} />;
const ListIcon = (p) => <Icon d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" {...p} />;

// ─── Main App ──────────────────────────────────────────────
export default function ConstructionOfferManager() {
  const [offers, setOffers] = useState([]);
  const [activeOfferId, setActiveOfferId] = useState(null);
  const [view, setView] = useState("list"); // "list" | "edit"
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const saveTimeoutRef = useRef(null);

  // ── Load from storage ──
  useEffect(() => {
    (async () => {
      try {
        const result = await window.storage.get(STORAGE_KEY);
        if (result && result.value) {
          const parsed = JSON.parse(result.value);
          setOffers(parsed.offers || []);
        }
      } catch {
        // No data yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save to storage (debounced) ──
  const persistOffers = useCallback(
    (newOffers) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(async () => {
        setSaving(true);
        try {
          await window.storage.set(STORAGE_KEY, JSON.stringify({ offers: newOffers, savedAt: Date.now() }));
          showToast("Saved");
        } catch (e) {
          showToast("Save failed!", true);
        } finally {
          setSaving(false);
        }
      }, 800);
    },
    []
  );

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 2000);
  };

  const updateOffers = (newOffers) => {
    setOffers(newOffers);
    persistOffers(newOffers);
  };

  const activeOffer = offers.find((o) => o.id === activeOfferId);

  const updateActiveOffer = (updater) => {
    const newOffers = offers.map((o) =>
      o.id === activeOfferId ? { ...updater(o), updatedAt: Date.now() } : o
    );
    updateOffers(newOffers);
  };

  // ── Offer CRUD ──
  const createOffer = () => {
    const o = createNewOffer("Offer " + (offers.length + 1));
    const newOffers = [...offers, o];
    updateOffers(newOffers);
    setActiveOfferId(o.id);
    setView("edit");
  };

  const duplicateOffer = (id) => {
    const src = offers.find((o) => o.id === id);
    if (!src) return;
    const dup = {
      ...JSON.parse(JSON.stringify(src)),
      id: Date.now().toString(),
      name: src.name + " (copy)",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    // Regenerate all IDs
    dup.sections = dup.sections.map((s) => ({
      ...s,
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      items: s.items.map((i) => ({
        ...i,
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      })),
    }));
    updateOffers([...offers, dup]);
    showToast("Duplicated!");
  };

  const deleteOffer = (id) => {
    updateOffers(offers.filter((o) => o.id !== id));
    if (activeOfferId === id) {
      setActiveOfferId(null);
      setView("list");
    }
  };

  // ── Section CRUD ──
  const addSection = () => {
    updateActiveOffer((o) => ({
      ...o,
      sections: [...o.sections, createNewSection("Section " + (o.sections.length + 1))],
    }));
  };

  const updateSection = (sectionId, updates) => {
    updateActiveOffer((o) => ({
      ...o,
      sections: o.sections.map((s) => (s.id === sectionId ? { ...s, ...updates } : s)),
    }));
  };

  const deleteSection = (sectionId) => {
    updateActiveOffer((o) => ({
      ...o,
      sections: o.sections.filter((s) => s.id !== sectionId),
    }));
  };

  // ── Item CRUD ──
  const addItem = (sectionId) => {
    updateActiveOffer((o) => ({
      ...o,
      sections: o.sections.map((s) =>
        s.id === sectionId ? { ...s, items: [...s.items, createNewItem()] } : s
      ),
    }));
  };

  const updateItem = (sectionId, itemId, updates) => {
    updateActiveOffer((o) => ({
      ...o,
      sections: o.sections.map((s) =>
        s.id === sectionId
          ? { ...s, items: s.items.map((i) => (i.id === itemId ? { ...i, ...updates } : i)) }
          : s
      ),
    }));
  };

  const deleteItem = (sectionId, itemId) => {
    updateActiveOffer((o) => ({
      ...o,
      sections: o.sections.map((s) =>
        s.id === sectionId ? { ...s, items: s.items.filter((i) => i.id !== itemId) } : s
      ),
    }));
  };

  // ── Totals ──
  const sectionTotal = (section) =>
    section.items.reduce((sum, i) => sum + (i.quantity || 0) * (i.unitPrice || 0), 0);

  const offerTotal = (offer) =>
    (offer?.sections || []).reduce((sum, s) => sum + sectionTotal(s), 0);

  // ── Render ──
  if (loading) {
    return (
      <div style={styles.loadingScreen}>
        <div style={styles.spinner} />
        <p style={{ color: "#8B7355", marginTop: 16, fontFamily: "'DM Sans', sans-serif" }}>Loading offers...</p>
      </div>
    );
  }

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.isError ? "#c0392b" : "#27ae60" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <div style={styles.logoMark}>CO</div>
            <div>
              <h1 style={styles.headerTitle}>Construction Offers</h1>
              <p style={styles.headerSub}>Manage & track proposals</p>
            </div>
          </div>
        </div>
        <div style={styles.headerRight}>
          {saving && <span style={styles.savingBadge}>Saving...</span>}
          {view === "edit" && (
            <button style={styles.backBtn} onClick={() => setView("list")}>
              ← All Offers
            </button>
          )}
        </div>
      </header>

      {view === "list" ? (
        <OfferList
          offers={offers}
          onSelect={(id) => { setActiveOfferId(id); setView("edit"); }}
          onCreate={createOffer}
          onDuplicate={duplicateOffer}
          onDelete={deleteOffer}
          offerTotal={offerTotal}
        />
      ) : activeOffer ? (
        <OfferEditor
          offer={activeOffer}
          updateOffer={(field, val) => updateActiveOffer((o) => ({ ...o, [field]: val }))}
          addSection={addSection}
          updateSection={updateSection}
          deleteSection={deleteSection}
          addItem={addItem}
          updateItem={updateItem}
          deleteItem={deleteItem}
          sectionTotal={sectionTotal}
          offerTotal={offerTotal}
        />
      ) : (
        <div style={styles.empty}>
          <p>Offer not found</p>
          <button style={styles.primaryBtn} onClick={() => setView("list")}>Back to list</button>
        </div>
      )}
    </div>
  );
}

// ─── Offer List View ───────────────────────────────────────
function OfferList({ offers, onSelect, onCreate, onDuplicate, onDelete, offerTotal }) {
  return (
    <div style={styles.content}>
      <div style={styles.listHeader}>
        <h2 style={styles.listTitle}>Your Offers</h2>
        <button style={styles.primaryBtn} onClick={onCreate}>
          <PlusIcon size={16} /> New Offer
        </button>
      </div>

      {offers.length === 0 ? (
        <div style={styles.emptyState}>
          <FileIcon size={48} color="#c4b5a0" />
          <h3 style={{ fontFamily: "'DM Serif Display', serif", color: "#5a4a3a", margin: "16px 0 8px" }}>
            No offers yet
          </h3>
          <p style={{ color: "#8B7355", marginBottom: 20 }}>Create your first construction offer to get started.</p>
          <button style={styles.primaryBtn} onClick={onCreate}>
            <PlusIcon size={16} /> Create Offer
          </button>
        </div>
      ) : (
        <div style={styles.offerGrid}>
          {offers.map((o) => (
            <div key={o.id} style={styles.offerCard} onClick={() => onSelect(o.id)}>
              <div style={styles.cardTop}>
                <div style={styles.cardBadge}>{o.sections.length} sections</div>
                <div style={styles.cardActions}>
                  <button
                    style={styles.iconBtn}
                    title="Duplicate"
                    onClick={(e) => { e.stopPropagation(); onDuplicate(o.id); }}
                  >
                    <CopyIcon size={14} />
                  </button>
                  <button
                    style={{ ...styles.iconBtn, color: "#c0392b" }}
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(o.id); }}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
              <h3 style={styles.cardTitle}>{o.name || "Untitled"}</h3>
              <p style={styles.cardClient}>{o.client || "No client"} — {o.project || "No project"}</p>
              <div style={styles.cardFooter}>
                <span style={styles.cardDate}>{o.date}</span>
                <span style={styles.cardTotal}>{fmt(offerTotal(o))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Offer Editor View ─────────────────────────────────────
function OfferEditor({ offer, updateOffer, addSection, updateSection, deleteSection, addItem, updateItem, deleteItem, sectionTotal, offerTotal }) {
  return (
    <div style={styles.content}>
      {/* Offer Meta */}
      <div style={styles.metaCard}>
        <div style={styles.metaGrid}>
          <div style={styles.metaField}>
            <label style={styles.label}>Offer Name</label>
            <input
              style={styles.input}
              value={offer.name}
              onChange={(e) => updateOffer("name", e.target.value)}
              placeholder="e.g. Kalavarda 14 Residences"
            />
          </div>
          <div style={styles.metaField}>
            <label style={styles.label}>Client</label>
            <input
              style={styles.input}
              value={offer.client}
              onChange={(e) => updateOffer("client", e.target.value)}
              placeholder="e.g. Jens Vanhove"
            />
          </div>
          <div style={styles.metaField}>
            <label style={styles.label}>Project</label>
            <input
              style={styles.input}
              value={offer.project}
              onChange={(e) => updateOffer("project", e.target.value)}
              placeholder="e.g. 14 Residences, Kalavarda"
            />
          </div>
          <div style={styles.metaField}>
            <label style={styles.label}>Date</label>
            <input
              style={styles.input}
              type="date"
              value={offer.date}
              onChange={(e) => updateOffer("date", e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Grand Total Bar */}
      <div style={styles.grandTotal}>
        <span style={styles.grandTotalLabel}>Grand Total</span>
        <span style={styles.grandTotalValue}>{fmt(offerTotal(offer))}</span>
      </div>

      {/* Sections */}
      {offer.sections.map((section, si) => (
        <SectionBlock
          key={section.id}
          section={section}
          index={si}
          updateSection={(u) => updateSection(section.id, u)}
          deleteSection={() => deleteSection(section.id)}
          addItem={() => addItem(section.id)}
          updateItem={(itemId, u) => updateItem(section.id, itemId, u)}
          deleteItem={(itemId) => deleteItem(section.id, itemId)}
          total={sectionTotal(section)}
        />
      ))}

      <button style={{ ...styles.primaryBtn, width: "100%", justifyContent: "center", padding: "14px 20px" }} onClick={addSection}>
        <PlusIcon size={16} /> Add Section
      </button>
    </div>
  );
}

// ─── Section Block ─────────────────────────────────────────
function SectionBlock({ section, index, updateSection, deleteSection, addItem, updateItem, deleteItem, total }) {
  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    if (editingName && nameRef.current) nameRef.current.focus();
  }, [editingName]);

  return (
    <div style={styles.sectionCard}>
      {/* Section Header */}
      <div style={styles.sectionHeader}>
        <button
          style={styles.collapseBtn}
          onClick={() => updateSection({ collapsed: !section.collapsed })}
        >
          {section.collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
        </button>

        {editingName ? (
          <input
            ref={nameRef}
            style={styles.sectionNameInput}
            value={section.name}
            onChange={(e) => updateSection({ name: e.target.value })}
            onBlur={() => setEditingName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
          />
        ) : (
          <h3 style={styles.sectionName} onDoubleClick={() => setEditingName(true)}>
            <span style={styles.sectionIndex}>{index + 1}.</span> {section.name}
            <button style={{ ...styles.iconBtn, marginLeft: 8 }} onClick={() => setEditingName(true)}>
              <EditIcon size={12} />
            </button>
          </h3>
        )}

        <div style={styles.sectionRight}>
          <span style={styles.sectionTotal}>{fmt(total)}</span>
          <button style={{ ...styles.iconBtn, color: "#c0392b" }} onClick={deleteSection}>
            <TrashIcon size={14} />
          </button>
        </div>
      </div>

      {/* Items Table */}
      {!section.collapsed && (
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: "5%" }}>#</th>
                <th style={{ ...styles.th, width: "35%" }}>Description</th>
                <th style={{ ...styles.th, width: "10%" }}>Qty</th>
                <th style={{ ...styles.th, width: "10%" }}>Unit</th>
                <th style={{ ...styles.th, width: "13%" }}>Unit Price (€)</th>
                <th style={{ ...styles.th, width: "13%" }}>Total (€)</th>
                <th style={{ ...styles.th, width: "10%" }}>Notes</th>
                <th style={{ ...styles.th, width: "4%" }}></th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, ii) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={ii}
                  updateItem={(u) => updateItem(item.id, u)}
                  deleteItem={() => deleteItem(item.id)}
                />
              ))}
              {section.items.length === 0 && (
                <tr>
                  <td colSpan={8} style={styles.emptyRow}>
                    No items yet — add one below
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={styles.tfootLabel}>Section Total</td>
                <td style={styles.tfootValue}>{fmtNum(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          <button style={styles.addItemBtn} onClick={addItem}>
            <PlusIcon size={14} /> Add Item
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Item Row ──────────────────────────────────────────────
function ItemRow({ item, index, updateItem, deleteItem }) {
  const lineTotal = (item.quantity || 0) * (item.unitPrice || 0);

  return (
    <tr style={styles.tr}>
      <td style={styles.td}><span style={styles.rowNum}>{index + 1}</span></td>
      <td style={styles.td}>
        <input
          style={styles.cellInput}
          value={item.description}
          onChange={(e) => updateItem({ description: e.target.value })}
          placeholder="Item description..."
        />
      </td>
      <td style={styles.td}>
        <input
          style={{ ...styles.cellInput, textAlign: "right" }}
          type="number"
          min={0}
          step="any"
          value={item.quantity || ""}
          onChange={(e) => updateItem({ quantity: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td style={styles.td}>
        <select
          style={styles.cellSelect}
          value={item.unit}
          onChange={(e) => updateItem({ unit: e.target.value })}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </td>
      <td style={styles.td}>
        <input
          style={{ ...styles.cellInput, textAlign: "right" }}
          type="number"
          min={0}
          step="any"
          value={item.unitPrice || ""}
          onChange={(e) => updateItem({ unitPrice: parseFloat(e.target.value) || 0 })}
        />
      </td>
      <td style={{ ...styles.td, fontWeight: 600, textAlign: "right", color: "#5a4a3a" }}>
        {fmtNum(lineTotal)}
      </td>
      <td style={styles.td}>
        <input
          style={styles.cellInput}
          value={item.notes}
          onChange={(e) => updateItem({ notes: e.target.value })}
          placeholder="..."
        />
      </td>
      <td style={styles.td}>
        <button style={{ ...styles.iconBtn, color: "#c0392b" }} onClick={deleteItem}>
          <TrashIcon size={13} />
        </button>
      </td>
    </tr>
  );
}

// ─── Styles ────────────────────────────────────────────────
const styles = {
  app: {
    fontFamily: "'DM Sans', sans-serif",
    background: "#f5f0e8",
    minHeight: "100vh",
    color: "#3a3028",
  },

  // Loading
  loadingScreen: {
    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", background: "#f5f0e8",
  },
  spinner: {
    width: 36, height: 36, border: "3px solid #ddd3c4", borderTopColor: "#8B7355",
    borderRadius: "50%", animation: "spin 0.8s linear infinite",
  },

  // Toast
  toast: {
    position: "fixed", top: 20, right: 20, zIndex: 1000, padding: "10px 20px",
    borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13,
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)", animation: "fadeIn 0.2s",
  },

  // Header
  header: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "16px 24px", background: "#3a3028", color: "#f5f0e8",
    borderBottom: "3px solid #8B7355",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 12 },
  logo: { display: "flex", alignItems: "center", gap: 12 },
  logoMark: {
    width: 40, height: 40, borderRadius: 10, background: "#8B7355",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'DM Serif Display', serif", fontWeight: 700, fontSize: 16, color: "#f5f0e8",
  },
  headerTitle: {
    fontFamily: "'DM Serif Display', serif", fontSize: 20, margin: 0, fontWeight: 400,
  },
  headerSub: { fontSize: 11, margin: 0, opacity: 0.6 },
  headerRight: { display: "flex", alignItems: "center", gap: 12 },
  savingBadge: {
    fontSize: 11, background: "rgba(255,255,255,0.15)", padding: "4px 10px",
    borderRadius: 20, color: "#ddd3c4",
  },
  backBtn: {
    background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
    color: "#f5f0e8", padding: "8px 16px", borderRadius: 8, cursor: "pointer",
    fontSize: 13, fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
  },

  // Content
  content: { maxWidth: 1100, margin: "0 auto", padding: "24px 20px" },

  // List View
  listHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24,
  },
  listTitle: {
    fontFamily: "'DM Serif Display', serif", fontSize: 28, margin: 0, color: "#3a3028",
  },
  primaryBtn: {
    display: "inline-flex", alignItems: "center", gap: 8, background: "#8B7355",
    color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8,
    cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
    transition: "background 0.2s",
  },
  offerGrid: {
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16,
  },
  offerCard: {
    background: "#fff", borderRadius: 12, padding: 20, cursor: "pointer",
    border: "1px solid #e8e0d4", transition: "box-shadow 0.2s, transform 0.2s",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardBadge: {
    fontSize: 11, background: "#f5f0e8", padding: "3px 10px", borderRadius: 20,
    color: "#8B7355", fontWeight: 600,
  },
  cardActions: { display: "flex", gap: 4 },
  cardTitle: {
    fontFamily: "'DM Serif Display', serif", fontSize: 18, margin: "0 0 4px", color: "#3a3028",
  },
  cardClient: { fontSize: 13, color: "#8B7355", margin: "0 0 16px" },
  cardFooter: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderTop: "1px solid #f0e8dc", paddingTop: 12,
  },
  cardDate: { fontSize: 12, color: "#aaa" },
  cardTotal: { fontSize: 18, fontWeight: 700, color: "#5a4a3a", fontFamily: "'DM Serif Display', serif" },

  // Empty State
  emptyState: {
    textAlign: "center", padding: "60px 20px", background: "#fff", borderRadius: 12,
    border: "2px dashed #ddd3c4",
  },
  empty: { textAlign: "center", padding: 60 },

  // Meta Card
  metaCard: {
    background: "#fff", borderRadius: 12, padding: 24, marginBottom: 16,
    border: "1px solid #e8e0d4",
  },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px", gap: 16 },
  metaField: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, color: "#8B7355" },
  input: {
    padding: "8px 12px", border: "1px solid #ddd3c4", borderRadius: 8, fontSize: 14,
    fontFamily: "'DM Sans', sans-serif", background: "#faf8f4", outline: "none",
    transition: "border-color 0.2s",
  },

  // Grand Total
  grandTotal: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#3a3028", color: "#f5f0e8", borderRadius: 12, padding: "16px 24px",
    marginBottom: 20,
  },
  grandTotalLabel: { fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 },
  grandTotalValue: { fontSize: 28, fontFamily: "'DM Serif Display', serif", fontWeight: 400 },

  // Section
  sectionCard: {
    background: "#fff", borderRadius: 12, marginBottom: 16,
    border: "1px solid #e8e0d4", overflow: "hidden",
  },
  sectionHeader: {
    display: "flex", alignItems: "center", padding: "14px 20px", gap: 8,
    borderBottom: "1px solid #f0e8dc", background: "#faf8f4",
  },
  collapseBtn: {
    background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8B7355",
    display: "flex", alignItems: "center",
  },
  sectionName: {
    fontFamily: "'DM Serif Display', serif", fontSize: 16, margin: 0, flex: 1,
    display: "flex", alignItems: "center", color: "#3a3028",
  },
  sectionIndex: { color: "#8B7355", marginRight: 6 },
  sectionNameInput: {
    flex: 1, padding: "4px 8px", border: "1px solid #8B7355", borderRadius: 6,
    fontSize: 16, fontFamily: "'DM Serif Display', serif", outline: "none",
    background: "#fff",
  },
  sectionRight: { display: "flex", alignItems: "center", gap: 12 },
  sectionTotal: { fontSize: 16, fontWeight: 700, color: "#5a4a3a", fontFamily: "'DM Serif Display', serif" },

  // Table
  tableWrap: { padding: "0 0 12px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    textAlign: "left", padding: "10px 8px", fontSize: 10, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: 0.8, color: "#8B7355",
    borderBottom: "2px solid #f0e8dc",
  },
  tr: { borderBottom: "1px solid #f8f4ee" },
  td: { padding: "6px 8px", verticalAlign: "middle" },
  rowNum: {
    display: "inline-flex", width: 22, height: 22, alignItems: "center", justifyContent: "center",
    borderRadius: 6, background: "#f5f0e8", fontSize: 11, fontWeight: 600, color: "#8B7355",
  },
  cellInput: {
    width: "100%", padding: "6px 8px", border: "1px solid transparent", borderRadius: 6,
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent",
    outline: "none", transition: "border-color 0.2s, background 0.2s", boxSizing: "border-box",
  },
  cellSelect: {
    width: "100%", padding: "6px 4px", border: "1px solid transparent", borderRadius: 6,
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", background: "transparent",
    outline: "none", cursor: "pointer",
  },
  emptyRow: { textAlign: "center", padding: 20, color: "#bbb", fontStyle: "italic" },
  tfootLabel: {
    textAlign: "right", padding: "12px 8px", fontWeight: 700, fontSize: 12,
    textTransform: "uppercase", letterSpacing: 0.5, color: "#8B7355",
  },
  tfootValue: {
    textAlign: "right", padding: "12px 8px", fontWeight: 700, fontSize: 15,
    color: "#3a3028", fontFamily: "'DM Serif Display', serif",
  },
  addItemBtn: {
    display: "inline-flex", alignItems: "center", gap: 6, background: "none",
    border: "1px dashed #ccc3b4", color: "#8B7355", padding: "8px 16px", margin: "8px 20px",
    borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
    fontFamily: "'DM Sans', sans-serif",
  },
  iconBtn: {
    background: "none", border: "none", cursor: "pointer", padding: 4, color: "#8B7355",
    display: "inline-flex", alignItems: "center", borderRadius: 4,
    transition: "background 0.2s",
  },
};
