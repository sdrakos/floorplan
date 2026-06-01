import { useEffect, useState } from "react";

const API_URL = "http://localhost:8000";
const H = { "Content-Type": "application/json" };
const UNITS = ["m²", "m", "m³", "τεμ", "kg", "lt", "ώρες", "ημέρες", "κατ' αποκοπή"];
const KINDS = [["work", "Εργασία"], ["material", "Υλικό"], ["combo", "Υλικό+Εργασία"]];
const fmt = (n) => new Intl.NumberFormat("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0);

export default function CatalogManager() {
  const [items, setItems] = useState([]);
  const [cats, setCats] = useState([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(""), 2500); };

  const load = async () => {
    setLoading(true); setErr("");
    try {
      const [r1, r2] = await Promise.all([fetch(API_URL + "/catalog"), fetch(API_URL + "/catalog/categories")]);
      if (!r1.ok) throw new Error();
      setItems(await r1.json());
      setCats(r2.ok ? await r2.json() : []);
    } catch { setErr("Δεν φορτώθηκε ο κατάλογος — τρέχει ο server (python back/app.py);"); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const setField = (id, f, v) => setItems((arr) => arr.map((it) => (it._k === id ? { ...it, [f]: v, _dirty: true } : it)));

  const addNew = () => setItems((arr) => [
    { _k: "new-" + Date.now(), _new: true, _dirty: true, category: cat || "Προσαρμοσμένα", description: "", unit: "τεμ", unit_price: 0, kind: "combo" },
    ...arr,
  ]);

  const saveRow = async (row) => {
    const body = { category: row.category, description: row.description, unit: row.unit, unit_price: Number(row.unit_price) || 0, kind: row.kind, code: row.code || null };
    try {
      if (row._new) {
        const r = await fetch(API_URL + "/catalog", { method: "POST", headers: H, body: JSON.stringify(body) });
        if (!r.ok) throw new Error();
        const saved = await r.json();
        setItems((arr) => arr.map((it) => (it._k === row._k ? { ...saved, _k: saved.id } : it)));
      } else {
        const r = await fetch(API_URL + "/catalog/" + row.id, { method: "PUT", headers: H, body: JSON.stringify(body) });
        if (!r.ok) throw new Error();
        setItems((arr) => arr.map((it) => (it._k === row._k ? { ...it, _dirty: false } : it)));
      }
      flash("✓ Αποθηκεύτηκε");
    } catch { flash("✗ Σφάλμα αποθήκευσης"); }
  };

  const delRow = async (row) => {
    if (!window.confirm("Διαγραφή «" + (row.description || "—") + "»;")) return;
    try {
      if (row.id) {
        const r = await fetch(API_URL + "/catalog/" + row.id, { method: "DELETE" });
        if (!r.ok && r.status !== 204) throw new Error();
      }
      setItems((arr) => arr.filter((it) => it._k !== row._k));
      flash("✓ Διαγράφηκε");
    } catch { flash("✗ Σφάλμα διαγραφής"); }
  };

  // attach a stable key
  const rows = items.map((it) => (it._k ? it : { ...it, _k: it.id }));
  const shown = rows.filter((it) => it._new ||
    ((!cat || it.category === cat) && (!q || (it.description || "").toLowerCase().includes(q.toLowerCase()))));

  const inp = { padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, width: "100%", boxSizing: "border-box", fontFamily: "inherit" };
  const th = { textAlign: "left", padding: "8px 8px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: .6, color: "#8B7355", borderBottom: "2px solid #f0e8dc", position: "sticky", top: 0, background: "#faf8f4" };
  const td = { padding: "5px 8px", borderBottom: "1px solid #f5f0e8", verticalAlign: "middle" };

  return (
    <div style={{ fontFamily: "'DM Sans',sans-serif", background: "#f5f0e8", minHeight: "calc(100vh - 50px)", color: "#3a3028" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 26, margin: 0 }}>📚 Κατάλογος Εργασιών & Υλικών</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {msg && <span style={{ fontSize: 12, color: msg.startsWith("✓") ? "#16A085" : "#c0392b", fontWeight: 600 }}>{msg}</span>}
            <button onClick={addNew} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#16A085", color: "#fff", fontWeight: 700, cursor: "pointer" }}>➕ Νέο είδος</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input placeholder="🔍 Αναζήτηση…" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...inp, flex: 1, minWidth: 200 }} />
          <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ ...inp, width: "auto" }}>
            <option value="">Όλες οι κατηγορίες</option>
            {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {loading && <p style={{ color: "#8B7355" }}>Φόρτωση…</p>}
        {err && <p style={{ color: "#c0392b" }}>{err}</p>}

        {!loading && !err && (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e8e0d4", overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                {["Κατηγορία", "Περιγραφή", "Μον.", "Τιμή €", "Είδος", ""].map((h, i) => <th key={i} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={it._k} style={{ background: it._new ? "rgba(22,160,133,0.06)" : "transparent" }}>
                    <td style={{ ...td, width: 150 }}><input list="catlist" value={it.category || ""} onChange={(e) => setField(it._k, "category", e.target.value)} style={inp} /></td>
                    <td style={td}><input value={it.description || ""} onChange={(e) => setField(it._k, "description", e.target.value)} placeholder="Περιγραφή…" style={inp} /></td>
                    <td style={{ ...td, width: 90 }}><select value={it.unit || "τεμ"} onChange={(e) => setField(it._k, "unit", e.target.value)} style={inp}>{UNITS.map((u) => <option key={u}>{u}</option>)}{!UNITS.includes(it.unit) && it.unit && <option>{it.unit}</option>}</select></td>
                    <td style={{ ...td, width: 90 }}><input type="number" step="any" value={it.unit_price ?? 0} onChange={(e) => setField(it._k, "unit_price", e.target.value)} style={{ ...inp, textAlign: "right", fontFamily: "'JetBrains Mono',monospace" }} /></td>
                    <td style={{ ...td, width: 130 }}><select value={it.kind || "combo"} onChange={(e) => setField(it._k, "kind", e.target.value)} style={inp}>{KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
                    <td style={{ ...td, width: 84, whiteSpace: "nowrap" }}>
                      <button onClick={() => saveRow(it)} title="Αποθήκευση" style={{ border: "none", background: it._dirty ? "#16A085" : "#e8e0d4", color: it._dirty ? "#fff" : "#8B7355", borderRadius: 6, padding: "5px 8px", cursor: "pointer", marginRight: 4 }}>💾</button>
                      <button onClick={() => delRow(it)} title="Διαγραφή" style={{ border: "none", background: "transparent", color: "#c0392b", borderRadius: 6, padding: "5px 8px", cursor: "pointer" }}>🗑</button>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "#bbb" }}>Κανένα είδος.</td></tr>}
              </tbody>
            </table>
            <datalist id="catlist">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
        )}
        <p style={{ fontSize: 11, color: "#9a8c7a", marginTop: 12 }}>
          {shown.length} είδη. Οι τιμές είναι ενδεικτικές — άλλαξέ τις ελεύθερα. Τα νέα είδη αποθηκεύονται στη βάση και εμφανίζονται στον picker της προσφοράς.
        </p>
      </div>
    </div>
  );
}
