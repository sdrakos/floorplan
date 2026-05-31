import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "offers-app-v2";

// ─── Built-in Templates ────────────────────────────────────
const BUILTIN_TEMPLATES = [
  {
    id: "residential-basic",
    name: "Κατοικίες — Βασικό",
    icon: "🏠",
    description: "Τυπικό τεύχος κατασκευής κατοικιών (χωματουργικά, σκυρόδεμα, τοιχοποιία, χρώματα, μονώσεις, Η/Μ)",
    category: "residential",
    sections: [
      { name: "1. Χωματουργικά", items: [
        { description: "Γενική εκσκαφή θεμελίωσης", unit: "m³", unitPrice: 0 },
        { description: "Εξυγίανση εδάφους / αποκατάσταση πρανών", unit: "m³", unitPrice: 0 },
        { description: "Μεταφορά πλεοναζόντων προϊόντων", unit: "m³", unitPrice: 0 },
      ]},
      { name: "2. Σκυρόδεμα", items: [
        { description: "Σκυρόδεμα καθαριότητας C12/15 (πάχος 10cm)", unit: "m²", unitPrice: 0 },
        { description: "Ξυλότυπος (ξύλινα καλούπια)", unit: "m²", unitPrice: 0 },
        { description: "Σίδερα οπλισμού (πλέγματα, ράβδοι)", unit: "kg", unitPrice: 0 },
        { description: "Σκυρόδεμα C25/30 με πρόσμικτα στεγανοποίησης", unit: "m³", unitPrice: 0 },
        { description: "Δόνηση / συμπύκνωση σκυροδέματος", unit: "m³", unitPrice: 0 },
      ]},
      { name: "3. Τοιχοποιία", items: [
        { description: "Εξωτερική διπλή τοιχοποιία (τούβλο 13×19×9)", unit: "m²", unitPrice: 0 },
        { description: "Εσωτερική μονή τοιχοποιία (τούβλο 19×19×9)", unit: "m²", unitPrice: 0 },
        { description: "Πέτρινη τοιχοποιία (εξωτερικά σημεία)", unit: "m²", unitPrice: 0 },
        { description: "Σενάζ μεσοτοιχίας / πλάκας", unit: "m", unitPrice: 0 },
      ]},
      { name: "4. Ξηρά Δόμηση (Γυψοσανίδες)", items: [
        { description: "Εσωτερικά χωρίσματα γυψοσανίδα + πετροβάμβακας (Κ+Κ)", unit: "m²", unitPrice: 0 },
        { description: "Χωρίσματα WC (Κ+Α+1Α υγρασίας)", unit: "m²", unitPrice: 0 },
        { description: "Ψευδοροφές (σαλόνι/τραπεζαρία)", unit: "m²", unitPrice: 0 },
        { description: "Ψευδοροφές μπάνιων (ανθυγρή γυψοσανίδα)", unit: "m²", unitPrice: 0 },
        { description: "Διακοσμητικά αρχιτεκτονικά στοιχεία εξωτερικά", unit: "m²", unitPrice: 0 },
      ]},
      { name: "5. Εξωτερική Θερμομόνωση (ETICS)", items: [
        { description: "Κολλητική μάζα θερμομόνωσης", unit: "m²", unitPrice: 0 },
        { description: "Πλάκες EPS (100×60cm, πάχος 5cm)", unit: "m²", unitPrice: 0 },
        { description: "Πλαστικά βύσματα στήριξης", unit: "pcs", unitPrice: 0 },
        { description: "Ελαστικός σοβάς + πλέγμα υαλοϋφάσματος", unit: "m²", unitPrice: 0 },
        { description: "Τελικός ακρυλικός σοβάς (θερμοπαστάλ)", unit: "m²", unitPrice: 0 },
        { description: "Ειδικά γωνιόκρανα / νεροσταλάκτες", unit: "m", unitPrice: 0 },
      ]},
      { name: "6. Επενδύσεις Πλακιδίων — Μάρμαρα", items: [
        { description: "Τσιμεντοκονία ισοπέδωσης (8-10cm)", unit: "m²", unitPrice: 0 },
        { description: "Πλακίδια δαπέδου εσωτ. (90×120cm)", unit: "m²", unitPrice: 0 },
        { description: "Πλακίδια δαπέδου εξωτ.", unit: "m²", unitPrice: 0 },
        { description: "Πλακίδια τοίχων WC", unit: "m²", unitPrice: 0 },
        { description: "Σοβατεπί (ύψος 7cm)", unit: "m", unitPrice: 0 },
        { description: "Περβάζια παραθύρων (μάρμαρο/πλακίδιο)", unit: "m", unitPrice: 0 },
      ]},
      { name: "7. Χρωματισμοί", items: [
        { description: "Εσωτερικοί χρωματισμοί (3 στρώσεις + αστάρι)", unit: "m²", unitPrice: 0 },
        { description: "Εξωτερικοί χρωματισμοί (ακρυλικό, 3 στρώσεις)", unit: "m²", unitPrice: 0 },
      ]},
      { name: "8. Στεγανοποίηση — Μονώσεις", items: [
        { description: "Στεγανοποίηση θεμελίωσης (ασφαλτόπανο 2 στρώσεις)", unit: "m²", unitPrice: 0 },
        { description: "Στεγανοποίηση πλάκας (ασφαλτόπανο + θερμομόνωση)", unit: "m²", unitPrice: 0 },
        { description: "Ελαφροσκυρόδεμα ρύσεων (INTERFILL)", unit: "m³", unitPrice: 0 },
        { description: "Πολυουρεθανική στεγανοποίηση μπαλκονιών", unit: "m²", unitPrice: 0 },
        { description: "Τσιμεντοειδής στεγανοποίηση υγρών χώρων", unit: "m²", unitPrice: 0 },
      ]},
      { name: "9. Ύδρευση — Αποχέτευση", items: [
        { description: "Δίκτυο ύδρευσης (σωλήνες Φ16/Φ18)", unit: "σημεία", unitPrice: 0 },
        { description: "Δίκτυο αποχέτευσης (σωλήνες έως Φ160)", unit: "σημεία", unitPrice: 0 },
        { description: "Αποχέτευση ομβρίων (Φ100 περιμετρικά)", unit: "m", unitPrice: 0 },
        { description: "Φρεάτια επίσκεψης", unit: "pcs", unitPrice: 0 },
        { description: "Σιφώνια δαπέδου", unit: "pcs", unitPrice: 0 },
      ]},
      { name: "10. Ηλεκτρολογικά", items: [
        { description: "Ηλεκτρολογικές εγκαταστάσεις ισχυρών ρευμάτων", unit: "κατ/μα", unitPrice: 0 },
        { description: "Ηλεκτρολογικές εγκαταστάσεις ασθενών ρευμάτων", unit: "κατ/μα", unitPrice: 0 },
        { description: "Πίνακες / ΥΔΕ", unit: "pcs", unitPrice: 0 },
        { description: "Γείωση / αντικεραυνική προστασία", unit: "κατ/μα", unitPrice: 0 },
      ]},
      { name: "11. Κλιματισμός", items: [
        { description: "Προεγκατάσταση A/C (χαλκοσωλήνες + αποχέτευση)", unit: "σημεία", unitPrice: 0 },
        { description: "Μονάδες A/C (προμήθεια + εγκατάσταση)", unit: "pcs", unitPrice: 0 },
        { description: "Ηλιακός θερμοσίφωνας", unit: "pcs", unitPrice: 0 },
      ]},
      { name: "12. Κουφώματα Αλουμινίου", items: [
        { description: "Κουφώματα αλουμινίου (ενεργειακά, με σίτες)", unit: "m²", unitPrice: 0 },
        { description: "Ρολά θερμοδιακοπής", unit: "pcs", unitPrice: 0 },
        { description: "Σταθερά πάνελ / φεγγίτες", unit: "pcs", unitPrice: 0 },
      ]},
      { name: "13. Ξυλουργικά", items: [
        { description: "Κουζίνα πάγκος (laminate ή άλλο)", unit: "m", unitPrice: 0 },
        { description: "Ντουλάπια κουζίνας", unit: "m", unitPrice: 0 },
        { description: "Ντουλάπες υπνοδωματίων", unit: "m", unitPrice: 0 },
        { description: "Εσωτερικές πόρτες MDF", unit: "pcs", unitPrice: 0 },
        { description: "Έπιπλο μπάνιου (νιπτήρας + συρτάρι)", unit: "pcs", unitPrice: 0 },
      ]},
      { name: "14. Είδη Υγιεινής", items: [
        { description: "Λεκάνη WC", unit: "pcs", unitPrice: 0 },
        { description: "Νιπτήρας με overflow", unit: "pcs", unitPrice: 0 },
        { description: "Καζανάκι εντοιχιζόμενο", unit: "pcs", unitPrice: 0 },
        { description: "Στήλη ντους", unit: "pcs", unitPrice: 0 },
        { description: "Μπαταρία νιπτήρα", unit: "pcs", unitPrice: 0 },
        { description: "Καθρέπτης LED", unit: "pcs", unitPrice: 0 },
      ]},
    ],
  },
  {
    id: "residential-pools",
    name: "Κατοικίες + Πισίνες",
    icon: "🏊",
    description: "Πλήρες τεύχος κατοικιών με πισίνες (περιλαμβάνει στεγανοποίηση, μηχανοστάσιο, επενδύσεις)",
    category: "residential",
    sections: [
      { name: "1. Χωματουργικά", items: [{ description: "Γενική εκσκαφή", unit: "m³", unitPrice: 0 }] },
      { name: "2. Σκυρόδεμα", items: [{ description: "Σκυρόδεμα C25/30", unit: "m³", unitPrice: 0 }] },
      { name: "3–8. Οικοδομικές εργασίες", items: [
        { description: "Τοιχοποιία / Ξηρά δόμηση / Θερμομόνωση / Πλακίδια / Χρώματα / Στεγανοποίηση (κατ' αποκοπή)", unit: "€", unitPrice: 0 },
      ]},
      { name: "9. Ύδρευση — Αποχέτευση", items: [{ description: "Πλήρης εγκατάσταση", unit: "κατ/μα", unitPrice: 0 }] },
      { name: "10. Πισίνες — Κατασκευή", items: [
        { description: "Στεγανοποίηση πισίνας (ασφαλτόπανο 2 στρώσεις)", unit: "m²", unitPrice: 0 },
        { description: "Προστατευτικό σκυρόδεμα τοιχωμάτων", unit: "m²", unitPrice: 0 },
        { description: "Water stop (butyl rubber cord)", unit: "m", unitPrice: 0 },
        { description: "Σωληνώσεις πισίνας (PVC 10 atm)", unit: "σετ", unitPrice: 0 },
        { description: "Μηχανοστάσιο (αντλία, φίλτρο, βαλβίδες)", unit: "σετ", unitPrice: 0 },
        { description: "Skimmer + return nozzle + floor drain", unit: "σετ", unitPrice: 0 },
        { description: "Ηλεκτρολογικά μηχανοστασίου", unit: "σετ", unitPrice: 0 },
      ]},
      { name: "11. Πισίνες — Επενδύσεις", items: [
        { description: "Μαρμάρινη κοπινγκ (coping)", unit: "m²", unitPrice: 70 },
        { description: "Γυάλινο backsplash πισίνας", unit: "m²", unitPrice: 30 },
        { description: "Μαρμάρινα σκαλοπάτια πισίνας", unit: "m²", unitPrice: 70 },
        { description: "Πλακίδια περιοχής πισίνας (60×120)", unit: "m²", unitPrice: 23 },
      ]},
      { name: "12. Κλιματισμός / Ηλιακά", items: [
        { description: "A/C μονάδες + εγκατάσταση", unit: "pcs", unitPrice: 0 },
        { description: "Ηλιακοί θερμοσίφωνες", unit: "pcs", unitPrice: 0 },
      ]},
      { name: "13. Κουφώματα", items: [{ description: "Αλουμίνια EUROPA (ενεργειακά)", unit: "m²", unitPrice: 0 }] },
      { name: "14. Ηλεκτρολογικά", items: [{ description: "Πλήρης ηλεκτρολογική εγκατάσταση", unit: "κατ/μα", unitPrice: 0 }] },
    ],
  },
  {
    id: "hotel-renovation",
    name: "Ξενοδοχείο — Ανακαίνιση",
    icon: "🏨",
    description: "Template ανακαίνισης ξενοδοχειακής μονάδας (δωμάτια, κοινόχρηστοι, F&B, περιβάλλων)",
    category: "hospitality",
    sections: [
      { name: "1. Αποξηλώσεις / Καθαιρέσεις", items: [
        { description: "Αποξήλωση υφιστάμενων δαπέδων", unit: "m²", unitPrice: 0 },
        { description: "Καθαίρεση τοιχοποιιών", unit: "m²", unitPrice: 0 },
        { description: "Αποκομιδή μπαζών", unit: "m³", unitPrice: 0 },
      ]},
      { name: "2. Δωμάτια (Room Renovation)", items: [
        { description: "Δάπεδα δωματίων (πλακίδια/laminate)", unit: "m²", unitPrice: 0 },
        { description: "Πλακίδια μπάνιων δωματίων", unit: "m²", unitPrice: 0 },
        { description: "Χρωματισμοί δωματίων", unit: "m²", unitPrice: 0 },
        { description: "Ψευδοροφές δωματίων", unit: "m²", unitPrice: 0 },
        { description: "Ηλεκτρολογική αναβάθμιση ανά δωμάτιο", unit: "δωμάτιο", unitPrice: 0 },
        { description: "Υδραυλική αναβάθμιση μπάνιου", unit: "δωμάτιο", unitPrice: 0 },
        { description: "Είδη υγιεινής (πλήρες σετ)", unit: "δωμάτιο", unitPrice: 0 },
      ]},
      { name: "3. Κοινόχρηστοι Χώροι", items: [
        { description: "Lobby renovation", unit: "m²", unitPrice: 0 },
        { description: "Διαδρόμοι / κλιμακοστάσια", unit: "m²", unitPrice: 0 },
      ]},
      { name: "4. F&B Χώροι", items: [
        { description: "Εστιατόριο / bar χώρος", unit: "m²", unitPrice: 0 },
        { description: "Κουζίνα (βιομηχανική)", unit: "σετ", unitPrice: 0 },
      ]},
      { name: "5. Περιβάλλων Χώρος / Πισίνα", items: [
        { description: "Pool deck ανακατασκευή", unit: "m²", unitPrice: 0 },
        { description: "Φωτισμός εξωτερικών χώρων", unit: "σημεία", unitPrice: 0 },
      ]},
      { name: "6. Η/Μ Εγκαταστάσεις", items: [
        { description: "Κεντρικός κλιματισμός (VRV/VRF)", unit: "kW", unitPrice: 0 },
        { description: "Ανελκυστήρας", unit: "pcs", unitPrice: 0 },
        { description: "Πυρανίχνευση / Πυρόσβεση", unit: "σετ", unitPrice: 0 },
        { description: "BMS / Αυτοματισμοί", unit: "σετ", unitPrice: 0 },
      ]},
    ],
  },
  {
    id: "commercial",
    name: "Εμπορικό / Γραφεία",
    icon: "🏢",
    description: "Κατασκευή ή ανακαίνιση εμπορικού χώρου / γραφείων",
    category: "commercial",
    sections: [
      { name: "1. Χωματουργικά / Καθαιρέσεις", items: [{ description: "Εκσκαφές / αποξηλώσεις", unit: "m³", unitPrice: 0 }] },
      { name: "2. Φέρων Οργανισμός", items: [{ description: "Σκυρόδεμα / μεταλλικός σκελετός", unit: "m³", unitPrice: 0 }] },
      { name: "3. Τοιχοπετάσματα / Χωρίσματα", items: [
        { description: "Γυψοσανίδες / γυάλινα χωρίσματα", unit: "m²", unitPrice: 0 },
      ]},
      { name: "4. Δάπεδα / Οροφές", items: [
        { description: "Υπερυψωμένο δάπεδο (raised floor)", unit: "m²", unitPrice: 0 },
        { description: "Ψευδοροφή (ακουστική)", unit: "m²", unitPrice: 0 },
      ]},
      { name: "5. Η/Μ Εγκαταστάσεις", items: [
        { description: "Ηλεκτρολογικά (δομημένη καλωδίωση)", unit: "m²", unitPrice: 0 },
        { description: "Κλιματισμός (FCU/VRF)", unit: "kW", unitPrice: 0 },
        { description: "Πυρανίχνευση / BMS", unit: "σετ", unitPrice: 0 },
      ]},
      { name: "6. Όψεις / Κουρτινοπέτασμα", items: [
        { description: "Αλουμινοκατασκευές όψεων", unit: "m²", unitPrice: 0 },
      ]},
    ],
  },
  {
    id: "blank",
    name: "Κενό Template",
    icon: "📄",
    description: "Ξεκίνα από μηδενική βάση — προσθέτεις sections και items εσύ",
    category: "other",
    sections: [],
  },
];

// ─── Helpers ───────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const createOfferFromTemplate = (template, name) => ({
  id: uid(),
  name: name || template.name,
  client: "",
  project: "",
  date: new Date().toISOString().split("T")[0],
  templateId: template.id,
  sections: template.sections.map((s) => ({
    id: uid(),
    name: s.name,
    collapsed: false,
    note: "",
    items: s.items.map((i) => ({
      id: uid(),
      description: i.description,
      quantity: i.quantity || 0,
      unit: i.unit || "pcs",
      unitPrice: i.unitPrice || 0,
      notes: i.notes || "",
    })),
  })),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

const UNITS = ["pcs", "m", "m²", "m³", "kg", "lt", "hrs", "days", "sets", "σετ", "σημεία", "κατ/μα", "δωμάτιο", "lm", "kW", "€"];

const fmt = (n) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
const fmtNum = (n) => new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

// ─── Icons ─────────────────────────────────────────────────
const Ico = ({ d, size = 18, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}><path d={d} /></svg>
);
const Plus = (p) => <Ico d="M12 5v14M5 12h14" {...p} />;
const Trash = (p) => <Ico d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" {...p} />;
const ChevDown = (p) => <Ico d="M6 9l6 6 6-6" {...p} />;
const ChevRight = (p) => <Ico d="M9 18l6-6-6-6" {...p} />;
const Edit = (p) => <Ico d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" {...p} />;
const Copy = (p) => <Ico d="M20 9h-9a2 2 0 00-2 2v9a2 2 0 002 2h9a2 2 0 002-2v-9a2 2 0 00-2-2zM5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" {...p} />;
const Doc = (p) => <Ico d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" {...p} />;
const Eye = (p) => <Ico d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z" {...p} />;
const Save = (p) => <Ico d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" {...p} />;
const Back = (p) => <Ico d="M19 12H5M12 19l-7-7 7-7" {...p} />;
const Template = (p) => <Ico d="M4 4h16v16H4zM4 9h16M9 4v16" {...p} />;

// ─── Main App ──────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState({ offers: [], customTemplates: [] });
  const [view, setView] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [previewOffer, setPreviewOffer] = useState(null);
  const saveRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORAGE_KEY);
        if (r?.value) setData(JSON.parse(r.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const persist = useCallback((d) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      setSaving(true);
      try { await window.storage.set(STORAGE_KEY, JSON.stringify(d)); showToast("✓ Αποθηκεύτηκε"); }
      catch { showToast("Αποτυχία αποθήκευσης!", true); }
      finally { setSaving(false); }
    }, 600);
  }, []);

  const showToast = (msg, err = false) => { setToast({ msg, err }); setTimeout(() => setToast(null), 2000); };

  const up = (fn) => {
    const nd = fn(data);
    setData(nd);
    persist(nd);
  };

  const activeOffer = data.offers.find((o) => o.id === activeId);

  const updateOffer = (fn) => up((d) => ({
    ...d,
    offers: d.offers.map((o) => o.id === activeId ? { ...fn(o), updatedAt: Date.now() } : o),
  }));

  // ── Offer Actions ──
  const createFromTemplate = (tmpl, name) => {
    const o = createOfferFromTemplate(tmpl, name);
    up((d) => ({ ...d, offers: [...d.offers, o] }));
    setActiveId(o.id);
    setView("edit");
  };

  const duplicateOffer = (id) => {
    const src = data.offers.find((o) => o.id === id);
    if (!src) return;
    const dup = JSON.parse(JSON.stringify(src));
    dup.id = uid(); dup.name += " (αντίγραφο)"; dup.createdAt = dup.updatedAt = Date.now();
    dup.sections.forEach((s) => { s.id = uid(); s.items.forEach((i) => { i.id = uid(); }); });
    up((d) => ({ ...d, offers: [...d.offers, dup] }));
    showToast("Αντιγράφηκε!");
  };

  const deleteOffer = (id) => {
    up((d) => ({ ...d, offers: d.offers.filter((o) => o.id !== id) }));
    if (activeId === id) { setActiveId(null); setView("list"); }
  };

  const saveAsTemplate = (offer) => {
    const tmpl = {
      id: "custom-" + uid(),
      name: offer.name + " (template)",
      icon: "⭐",
      description: "Custom template from " + offer.name,
      category: "custom",
      sections: offer.sections.map((s) => ({
        name: s.name,
        items: s.items.map((i) => ({ description: i.description, unit: i.unit, unitPrice: i.unitPrice })),
      })),
    };
    up((d) => ({ ...d, customTemplates: [...d.customTemplates, tmpl] }));
    showToast("Αποθηκεύτηκε ως template!");
  };

  // ── Section/Item CRUD ──
  const addSection = () => updateOffer((o) => ({
    ...o,
    sections: [...o.sections, { id: uid(), name: "Νέα Ενότητα " + (o.sections.length + 1), collapsed: false, note: "", items: [] }],
  }));

  const updateSection = (sid, u) => updateOffer((o) => ({
    ...o,
    sections: o.sections.map((s) => s.id === sid ? { ...s, ...u } : s),
  }));

  const deleteSection = (sid) => updateOffer((o) => ({
    ...o,
    sections: o.sections.filter((s) => s.id !== sid),
  }));

  const addItem = (sid) => updateOffer((o) => ({
    ...o,
    sections: o.sections.map((s) => s.id === sid ? { ...s, items: [...s.items, { id: uid(), description: "", quantity: 0, unit: "pcs", unitPrice: 0, notes: "" }] } : s),
  }));

  const updateItem = (sid, iid, u) => updateOffer((o) => ({
    ...o,
    sections: o.sections.map((s) => s.id === sid ? { ...s, items: s.items.map((i) => i.id === iid ? { ...i, ...u } : i) } : s),
  }));

  const deleteItem = (sid, iid) => updateOffer((o) => ({
    ...o,
    sections: o.sections.map((s) => s.id === sid ? { ...s, items: s.items.filter((i) => i.id !== iid) } : s),
  }));

  const secTotal = (s) => s.items.reduce((a, i) => a + (i.quantity || 0) * (i.unitPrice || 0), 0);
  const offTotal = (o) => (o?.sections || []).reduce((a, s) => a + secTotal(s), 0);

  const allTemplates = [...BUILTIN_TEMPLATES, ...(data.customTemplates || [])];

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "#0f0f0f", color: "#888", fontFamily: "'JetBrains Mono', monospace" }}>
      <p>Φόρτωση...</p>
    </div>
  );

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus, textarea:focus { border-color: #f59e0b !important; background: rgba(245,158,11,0.05) !important; }
        button:hover { opacity: 0.85; }
        .card-hover:hover { border-color: #f59e0b !important; transform: translateY(-2px); box-shadow: 0 8px 30px rgba(245,158,11,0.1) !important; }
        tr:hover { background: rgba(245,158,11,0.03); }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1a1a1a; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
      `}</style>

      {toast && <div style={{ ...S.toast, background: toast.err ? "#ef4444" : "#22c55e" }}>{toast.msg}</div>}

      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={S.logoBox}>τ</div>
          <div>
            <h1 style={S.h1}>Τεύχος Builder</h1>
            <p style={S.sub}>Κατασκευή & Διαχείριση Προσφορών</p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saving && <span style={S.badge}>Saving...</span>}
          {view !== "list" && (
            <button style={S.headerBtn} onClick={() => { setView("list"); setPreviewOffer(null); }}>
              <Back size={14} /> Λίστα
            </button>
          )}
        </div>
      </header>

      <main style={S.main}>
        {view === "list" && (
          <ListView
            offers={data.offers}
            templates={allTemplates}
            onSelect={(id) => { setActiveId(id); setView("edit"); }}
            onCreate={createFromTemplate}
            onDuplicate={duplicateOffer}
            onDelete={deleteOffer}
            onPreview={(o) => { setPreviewOffer(o); setView("preview"); }}
            offTotal={offTotal}
          />
        )}
        {view === "edit" && activeOffer && (
          <EditorView
            offer={activeOffer}
            updateField={(f, v) => updateOffer((o) => ({ ...o, [f]: v }))}
            addSection={addSection}
            updateSection={updateSection}
            deleteSection={deleteSection}
            addItem={addItem}
            updateItem={updateItem}
            deleteItem={deleteItem}
            secTotal={secTotal}
            offTotal={offTotal}
            onPreview={() => { setPreviewOffer(activeOffer); setView("preview"); }}
            onSaveAsTemplate={() => saveAsTemplate(activeOffer)}
          />
        )}
        {view === "preview" && previewOffer && (
          <PreviewView offer={previewOffer} offTotal={offTotal} secTotal={secTotal} />
        )}
      </main>
    </div>
  );
}

// ─── List View ─────────────────────────────────────────────
function ListView({ offers, templates, onSelect, onCreate, onDuplicate, onDelete, onPreview, offTotal }) {
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const cats = { residential: "Κατοικίες", hospitality: "Φιλοξενία", commercial: "Εμπορικά", custom: "Custom", other: "Λοιπά" };

  return (
    <div>
      {/* Template Picker Modal */}
      {showTemplates && (
        <div style={S.modal} onClick={() => setShowTemplates(false)}>
          <div style={S.modalContent} onClick={(e) => e.stopPropagation()}>
            <h2 style={S.modalTitle}>Επιλογή Template</h2>
            <input style={S.modalInput} placeholder="Όνομα νέας προσφοράς..." value={templateName} onChange={(e) => setTemplateName(e.target.value)} autoFocus />
            <div style={S.templateGrid}>
              {templates.map((t) => (
                <button key={t.id} className="card-hover" style={S.templateCard} onClick={() => { onCreate(t, templateName || t.name); setShowTemplates(false); setTemplateName(""); }}>
                  <span style={S.templateIcon}>{t.icon}</span>
                  <h3 style={S.templateName}>{t.name}</h3>
                  <p style={S.templateDesc}>{t.description}</p>
                  <span style={S.templateBadge}>{cats[t.category] || t.category}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={S.pageTitle}>Οι Προσφορές σου</h2>
        <button style={S.primary} onClick={() => setShowTemplates(true)}>
          <Plus size={15} /> Νέα Προσφορά
        </button>
      </div>

      {offers.length === 0 ? (
        <div style={S.empty}>
          <Doc size={48} color="#444" />
          <h3 style={{ color: "#ccc", margin: "16px 0 8px", fontFamily: "'Space Grotesk', sans-serif" }}>Δεν υπάρχουν προσφορές</h3>
          <p style={{ color: "#666", marginBottom: 20 }}>Δημιούργησε μια νέα επιλέγοντας template.</p>
          <button style={S.primary} onClick={() => setShowTemplates(true)}><Plus size={15} /> Ξεκίνα</button>
        </div>
      ) : (
        <div style={S.grid}>
          {offers.map((o) => (
            <div key={o.id} className="card-hover" style={S.offerCard} onClick={() => onSelect(o.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={S.chipSmall}>{o.sections.length} ενότητες</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={S.iconBtn} title="Προεπισκόπηση" onClick={(e) => { e.stopPropagation(); onPreview(o); }}><Eye size={13} /></button>
                  <button style={S.iconBtn} title="Αντιγραφή" onClick={(e) => { e.stopPropagation(); onDuplicate(o.id); }}><Copy size={13} /></button>
                  <button style={{ ...S.iconBtn, color: "#ef4444" }} title="Διαγραφή" onClick={(e) => { e.stopPropagation(); onDelete(o.id); }}><Trash size={13} /></button>
                </div>
              </div>
              <h3 style={S.cardTitle}>{o.name || "Χωρίς τίτλο"}</h3>
              <p style={S.cardSub}>{o.client || "—"} • {o.project || "—"}</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #222", paddingTop: 12, marginTop: 12 }}>
                <span style={{ fontSize: 11, color: "#555" }}>{o.date}</span>
                <span style={S.cardTotal}>{fmt(offTotal(o))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Editor View ───────────────────────────────────────────
function EditorView({ offer, updateField, addSection, updateSection, deleteSection, addItem, updateItem, deleteItem, secTotal, offTotal, onPreview, onSaveAsTemplate }) {
  return (
    <div>
      {/* Meta */}
      <div style={S.metaCard}>
        <div style={S.metaGrid}>
          <Field label="Τίτλος" value={offer.name} onChange={(v) => updateField("name", v)} />
          <Field label="Πελάτης" value={offer.client} onChange={(v) => updateField("client", v)} placeholder="π.χ. Jens Vanhove" />
          <Field label="Έργο" value={offer.project} onChange={(v) => updateField("project", v)} placeholder="π.χ. 14 κατοικίες Καλαβάρδα" />
          <Field label="Ημ/νία" value={offer.date} onChange={(v) => updateField("date", v)} type="date" />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button style={S.secondaryBtn} onClick={onPreview}><Eye size={14} /> Προεπισκόπηση Τεύχους</button>
          <button style={S.secondaryBtn} onClick={onSaveAsTemplate}><Save size={14} /> Αποθήκευση ως Template</button>
        </div>
      </div>

      {/* Grand Total */}
      <div style={S.grandTotal}>
        <span style={S.gtLabel}>Συνολικό Κόστος</span>
        <span style={S.gtValue}>{fmt(offTotal(offer))}</span>
      </div>

      {/* Sections */}
      {offer.sections.map((sec, si) => (
        <SectionBlock key={sec.id} section={sec} idx={si}
          update={(u) => updateSection(sec.id, u)}
          remove={() => deleteSection(sec.id)}
          addItem={() => addItem(sec.id)}
          updateItem={(iid, u) => updateItem(sec.id, iid, u)}
          deleteItem={(iid) => deleteItem(sec.id, iid)}
          total={secTotal(sec)} />
      ))}

      <button style={{ ...S.primary, width: "100%", justifyContent: "center", padding: "14px 20px" }} onClick={addSection}>
        <Plus size={15} /> Προσθήκη Ενότητας
      </button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", placeholder = "" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={S.label}>{label}</label>
      <input style={S.input} type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

// ─── Section Block ─────────────────────────────────────────
function SectionBlock({ section, idx, update, remove, addItem, updateItem, deleteItem, total }) {
  const [editName, setEditName] = useState(false);
  const ref = useRef();
  useEffect(() => { if (editName && ref.current) ref.current.focus(); }, [editName]);

  return (
    <div style={S.sectionCard}>
      <div style={S.secHeader}>
        <button style={S.colBtn} onClick={() => update({ collapsed: !section.collapsed })}>
          {section.collapsed ? <ChevRight size={16} /> : <ChevDown size={16} />}
        </button>
        {editName ? (
          <input ref={ref} style={S.secNameInput} value={section.name}
            onChange={(e) => update({ name: e.target.value })}
            onBlur={() => setEditName(false)}
            onKeyDown={(e) => e.key === "Enter" && setEditName(false)} />
        ) : (
          <h3 style={S.secName} onDoubleClick={() => setEditName(true)}>
            <span style={{ color: "#f59e0b" }}>{idx + 1}.</span> {section.name}
            <button style={{ ...S.iconBtn, marginLeft: 6 }} onClick={() => setEditName(true)}><Edit size={11} /></button>
          </h3>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
          <span style={S.secTotal}>{fmt(total)}</span>
          <button style={{ ...S.iconBtn, color: "#ef4444" }} onClick={remove}><Trash size={14} /></button>
        </div>
      </div>

      {!section.collapsed && (
        <div style={{ padding: "0 0 8px", overflowX: "auto" }}>
          {/* Section note */}
          <div style={{ padding: "4px 16px" }}>
            <textarea style={S.secNote} rows={1} placeholder="Σημειώσεις ενότητας..."
              value={section.note || ""} onChange={(e) => update({ note: e.target.value })} />
          </div>
          <table style={S.table}>
            <thead><tr>
              <th style={{ ...S.th, width: "4%" }}>#</th>
              <th style={{ ...S.th, width: "34%" }}>Περιγραφή</th>
              <th style={{ ...S.th, width: "9%" }}>Ποσότ.</th>
              <th style={{ ...S.th, width: "9%" }}>Μον.</th>
              <th style={{ ...S.th, width: "12%" }}>Τιμή Μον. (€)</th>
              <th style={{ ...S.th, width: "12%" }}>Σύνολο (€)</th>
              <th style={{ ...S.th, width: "16%" }}>Σημείωση</th>
              <th style={{ ...S.th, width: "4%" }}></th>
            </tr></thead>
            <tbody>
              {section.items.map((item, ii) => (
                <ItemRow key={item.id} item={item} idx={ii}
                  update={(u) => updateItem(item.id, u)}
                  remove={() => deleteItem(item.id)} />
              ))}
              {section.items.length === 0 && (
                <tr><td colSpan={8} style={S.emptyRow}>Κανένα αντικείμενο — πρόσθεσε παρακάτω</td></tr>
              )}
            </tbody>
            <tfoot><tr>
              <td colSpan={5} style={S.tfLabel}>Σύνολο Ενότητας</td>
              <td style={S.tfVal}>{fmtNum(total)}</td>
              <td colSpan={2}></td>
            </tr></tfoot>
          </table>
          <button style={S.addItemBtn} onClick={addItem}><Plus size={13} /> Προσθήκη Εγγραφής</button>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item, idx, update, remove }) {
  const t = (item.quantity || 0) * (item.unitPrice || 0);
  return (
    <tr>
      <td style={S.td}><span style={S.rowN}>{idx + 1}</span></td>
      <td style={S.td}><input style={S.ci} value={item.description} onChange={(e) => update({ description: e.target.value })} placeholder="Περιγραφή..." /></td>
      <td style={S.td}><input style={{ ...S.ci, textAlign: "right" }} type="number" min={0} step="any" value={item.quantity || ""} onChange={(e) => update({ quantity: parseFloat(e.target.value) || 0 })} /></td>
      <td style={S.td}>
        <select style={S.cs} value={item.unit} onChange={(e) => update({ unit: e.target.value })}>
          {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={S.td}><input style={{ ...S.ci, textAlign: "right" }} type="number" min={0} step="any" value={item.unitPrice || ""} onChange={(e) => update({ unitPrice: parseFloat(e.target.value) || 0 })} /></td>
      <td style={{ ...S.td, fontWeight: 700, textAlign: "right", color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{fmtNum(t)}</td>
      <td style={S.td}><input style={S.ci} value={item.notes} onChange={(e) => update({ notes: e.target.value })} placeholder="..." /></td>
      <td style={S.td}><button style={{ ...S.iconBtn, color: "#ef4444" }} onClick={remove}><Trash size={12} /></button></td>
    </tr>
  );
}

// ─── Preview / Τεύχος View ─────────────────────────────────
function PreviewView({ offer, offTotal, secTotal }) {
  return (
    <div style={S.previewWrap}>
      <div style={S.previewPage}>
        {/* Cover */}
        <div style={S.pvCover}>
          <h1 style={S.pvTitle}>{offer.name || "Τεύχος Προσφοράς"}</h1>
          <div style={S.pvDivider}></div>
          <p style={S.pvMeta}><strong>Πελάτης:</strong> {offer.client || "—"}</p>
          <p style={S.pvMeta}><strong>Έργο:</strong> {offer.project || "—"}</p>
          <p style={S.pvMeta}><strong>Ημερομηνία:</strong> {offer.date}</p>
          <div style={S.pvTotalBox}>
            <span style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>Συνολικό Κόστος</span>
            <span style={{ fontSize: 28, fontWeight: 700 }}>{fmt(offTotal(offer))}</span>
          </div>
        </div>

        {/* Summary Table */}
        <h2 style={S.pvH2}>Συνοπτικός Πίνακας Κοστών</h2>
        <table style={S.pvTable}>
          <thead><tr>
            <th style={S.pvTh}>Α/Α</th>
            <th style={{ ...S.pvTh, textAlign: "left" }}>Ενότητα</th>
            <th style={S.pvTh}>Κόστος (€)</th>
          </tr></thead>
          <tbody>
            {offer.sections.map((s, i) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                <td style={S.pvTd}>{i + 1}</td>
                <td style={{ ...S.pvTd, textAlign: "left", fontWeight: 500 }}>{s.name}</td>
                <td style={{ ...S.pvTd, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(secTotal(s))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr style={{ background: "#111827", color: "#f59e0b" }}>
            <td colSpan={2} style={{ ...S.pvTd, fontWeight: 700, textAlign: "right" }}>ΣΥΝΟΛΟ</td>
            <td style={{ ...S.pvTd, fontWeight: 700, fontSize: 16, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(offTotal(offer))}</td>
          </tr></tfoot>
        </table>

        {/* Detailed Sections */}
        {offer.sections.map((s, si) => (
          <div key={s.id} style={{ marginTop: 32 }}>
            <h3 style={S.pvH3}>{si + 1}. {s.name}</h3>
            {s.note && <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 8, fontStyle: "italic" }}>{s.note}</p>}
            <table style={S.pvTable}>
              <thead><tr>
                <th style={S.pvTh}>#</th>
                <th style={{ ...S.pvTh, textAlign: "left" }}>Περιγραφή</th>
                <th style={S.pvTh}>Ποσότ.</th>
                <th style={S.pvTh}>Μον.</th>
                <th style={S.pvTh}>Τιμή Μον.</th>
                <th style={S.pvTh}>Σύνολο</th>
              </tr></thead>
              <tbody>
                {s.items.map((i, ii) => (
                  <tr key={i.id} style={{ borderBottom: "1px solid #e5e7eb" }}>
                    <td style={S.pvTd}>{ii + 1}</td>
                    <td style={{ ...S.pvTd, textAlign: "left" }}>{i.description}{i.notes ? <span style={{ color: "#9ca3af", fontSize: 11 }}> ({i.notes})</span> : ""}</td>
                    <td style={{ ...S.pvTd, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(i.quantity)}</td>
                    <td style={S.pvTd}>{i.unit}</td>
                    <td style={{ ...S.pvTd, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(i.unitPrice)}</td>
                    <td style={{ ...S.pvTd, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum((i.quantity || 0) * (i.unitPrice || 0))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr style={{ background: "#f9fafb" }}>
                <td colSpan={5} style={{ ...S.pvTd, textAlign: "right", fontWeight: 600 }}>Σύνολο Ενότητας</td>
                <td style={{ ...S.pvTd, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{fmtNum(secTotal(s))}</td>
              </tr></tfoot>
            </table>
          </div>
        ))}

        {/* Footer */}
        <div style={{ marginTop: 48, paddingTop: 16, borderTop: "2px solid #e5e7eb", textAlign: "center", color: "#9ca3af", fontSize: 11 }}>
          Δημιουργήθηκε με Τεύχος Builder • {new Date().toLocaleDateString("el-GR")}
        </div>
      </div>
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────
const S = {
  app: { fontFamily: "'Space Grotesk', sans-serif", background: "#0f0f0f", minHeight: "100vh", color: "#e5e5e5" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 24px", background: "#111", borderBottom: "1px solid #222" },
  logoBox: { width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #f59e0b, #d97706)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 18, color: "#000" },
  h1: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 18, margin: 0, fontWeight: 700, color: "#fff" },
  sub: { fontSize: 10, margin: 0, color: "#666", textTransform: "uppercase", letterSpacing: 1 },
  badge: { fontSize: 10, background: "#1a1a1a", border: "1px solid #333", padding: "3px 10px", borderRadius: 20, color: "#888" },
  headerBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#1a1a1a", border: "1px solid #333", color: "#ccc", padding: "7px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" },
  main: { maxWidth: 1100, margin: "0 auto", padding: "24px 16px" },
  toast: { position: "fixed", top: 16, right: 16, zIndex: 9999, padding: "8px 18px", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 12, animation: "fadeIn 0.2s", fontFamily: "'Space Grotesk', sans-serif" },

  // List
  pageTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 },
  primary: { display: "inline-flex", alignItems: "center", gap: 7, background: "#f59e0b", color: "#000", border: "none", padding: "10px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" },
  secondaryBtn: { display: "inline-flex", alignItems: "center", gap: 6, background: "#1a1a1a", border: "1px solid #333", color: "#ccc", padding: "8px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontFamily: "'Space Grotesk', sans-serif" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 },
  offerCard: { background: "#161616", borderRadius: 10, padding: 18, cursor: "pointer", border: "1px solid #222", transition: "all 0.2s" },
  chipSmall: { fontSize: 10, background: "#1a1a1a", border: "1px solid #333", padding: "2px 8px", borderRadius: 12, color: "#888" },
  iconBtn: { background: "none", border: "none", cursor: "pointer", padding: 3, color: "#666", display: "inline-flex", alignItems: "center" },
  cardTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 16, fontWeight: 700, margin: "0 0 4px", color: "#fff" },
  cardSub: { fontSize: 12, color: "#666", margin: 0 },
  cardTotal: { fontSize: 16, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" },
  empty: { textAlign: "center", padding: 60, background: "#111", borderRadius: 12, border: "1px dashed #333" },

  // Modal
  modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modalContent: { background: "#161616", borderRadius: 16, padding: 28, maxWidth: 700, width: "100%", maxHeight: "85vh", overflow: "auto", border: "1px solid #333" },
  modalTitle: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", margin: "0 0 16px" },
  modalInput: { width: "100%", padding: "10px 14px", border: "1px solid #333", borderRadius: 8, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", background: "#111", color: "#fff", outline: "none", marginBottom: 20, boxSizing: "border-box" },
  templateGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  templateCard: { background: "#111", border: "1px solid #222", borderRadius: 10, padding: 16, cursor: "pointer", textAlign: "left", transition: "all 0.2s", fontFamily: "'Space Grotesk', sans-serif", color: "#ccc" },
  templateIcon: { fontSize: 28, display: "block", marginBottom: 8 },
  templateName: { fontSize: 14, fontWeight: 700, margin: "0 0 4px", color: "#fff" },
  templateDesc: { fontSize: 11, color: "#666", margin: "0 0 8px", lineHeight: 1.4 },
  templateBadge: { fontSize: 9, background: "#1a1a1a", border: "1px solid #333", padding: "2px 8px", borderRadius: 10, color: "#f59e0b", textTransform: "uppercase", letterSpacing: 0.5 },

  // Editor Meta
  metaCard: { background: "#161616", borderRadius: 10, padding: 20, marginBottom: 14, border: "1px solid #222" },
  metaGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 130px", gap: 14 },
  label: { fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#666" },
  input: { padding: "8px 12px", border: "1px solid #333", borderRadius: 6, fontSize: 13, fontFamily: "'Space Grotesk', sans-serif", background: "#111", color: "#fff", outline: "none", boxSizing: "border-box" },

  // Grand Total
  grandTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "linear-gradient(135deg, #1a1a1a, #111)", border: "1px solid #f59e0b33", borderRadius: 10, padding: "16px 24px", marginBottom: 18 },
  gtLabel: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "#888" },
  gtValue: { fontSize: 28, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#f59e0b" },

  // Section
  sectionCard: { background: "#161616", borderRadius: 10, marginBottom: 14, border: "1px solid #222", overflow: "hidden" },
  secHeader: { display: "flex", alignItems: "center", padding: "12px 16px", gap: 8, borderBottom: "1px solid #1a1a1a", background: "#111" },
  colBtn: { background: "none", border: "none", cursor: "pointer", padding: 3, color: "#f59e0b", display: "flex" },
  secName: { fontFamily: "'Space Grotesk', sans-serif", fontSize: 14, fontWeight: 700, margin: 0, display: "flex", alignItems: "center", color: "#eee" },
  secNameInput: { flex: 1, padding: "4px 8px", border: "1px solid #f59e0b", borderRadius: 4, fontSize: 14, fontFamily: "'Space Grotesk', sans-serif", background: "#111", color: "#fff", outline: "none" },
  secTotal: { fontSize: 14, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" },
  secNote: { width: "100%", padding: "6px 10px", border: "1px solid #222", borderRadius: 4, fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", background: "#111", color: "#999", outline: "none", resize: "vertical", boxSizing: "border-box" },

  // Table
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { textAlign: "left", padding: "8px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#555", borderBottom: "1px solid #222" },
  td: { padding: "5px 6px", verticalAlign: "middle" },
  rowN: { display: "inline-flex", width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 4, background: "#1a1a1a", fontSize: 10, fontWeight: 700, color: "#666" },
  ci: { width: "100%", padding: "5px 7px", border: "1px solid transparent", borderRadius: 4, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif", background: "transparent", color: "#ddd", outline: "none", boxSizing: "border-box" },
  cs: { width: "100%", padding: "5px 4px", border: "1px solid transparent", borderRadius: 4, fontSize: 12, fontFamily: "'Space Grotesk', sans-serif", background: "transparent", color: "#ddd", outline: "none", cursor: "pointer" },
  emptyRow: { textAlign: "center", padding: 20, color: "#444", fontStyle: "italic" },
  tfLabel: { textAlign: "right", padding: "10px 6px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#666" },
  tfVal: { textAlign: "right", padding: "10px 6px", fontWeight: 700, fontSize: 14, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" },
  addItemBtn: { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "1px dashed #333", color: "#666", padding: "6px 14px", margin: "6px 16px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "'Space Grotesk', sans-serif" },

  // Preview
  previewWrap: { display: "flex", justifyContent: "center", padding: "0 16px" },
  previewPage: { background: "#fff", color: "#111", borderRadius: 12, padding: "48px 40px", maxWidth: 800, width: "100%", fontFamily: "'Space Grotesk', sans-serif", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" },
  pvCover: { textAlign: "center", marginBottom: 40, paddingBottom: 32, borderBottom: "2px solid #e5e7eb" },
  pvTitle: { fontSize: 28, fontWeight: 700, color: "#111827", margin: "0 0 12px" },
  pvDivider: { width: 60, height: 3, background: "#f59e0b", margin: "0 auto 20px", borderRadius: 2 },
  pvMeta: { fontSize: 14, color: "#6b7280", margin: "4px 0" },
  pvTotalBox: { marginTop: 24, display: "inline-flex", flexDirection: "column", gap: 4, padding: "16px 32px", background: "#111827", color: "#f59e0b", borderRadius: 10 },
  pvH2: { fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 12px", borderBottom: "2px solid #f59e0b", paddingBottom: 8, display: "inline-block" },
  pvH3: { fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 8px" },
  pvTable: { width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 4 },
  pvTh: { padding: "8px 10px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8, color: "#6b7280", borderBottom: "2px solid #e5e7eb", textAlign: "center", background: "#f9fafb" },
  pvTd: { padding: "8px 10px", textAlign: "center" },
};
