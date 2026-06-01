import { useState } from "react";
import FloorPlanTakeoff from "../floor-plan-takeoff.jsx";
import TeuchosBuilder from "../teuchos-builder-v3.jsx";

// Top-level shell with a menu to switch between the two tools.
const TABS = [
  { id: "takeoff", label: "📐 Κατόψεις / Μετρήσεις", C: FloorPlanTakeoff },
  { id: "offers", label: "📋 Προσφορές (Τεύχος)", C: TeuchosBuilder },
];

export default function App() {
  const [tab, setTab] = useState(() => localStorage.getItem("floorplan-tab") || "takeoff");
  const Active = (TABS.find((t) => t.id === tab) || TABS[0]).C;
  return (
    <div>
      <nav style={{
        display: "flex", gap: 8, padding: "8px 16px", background: "#2a2018",
        borderBottom: "2px solid #8B7355", position: "sticky", top: 0, zIndex: 10000,
        fontFamily: "'DM Sans',sans-serif", alignItems: "center",
      }}>
        <span style={{ color: "#f5f0e8", fontWeight: 700, fontFamily: "'Cormorant Garamond',serif", fontSize: 18, marginRight: 14 }}>
          AGEL · FloorPlan
        </span>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); localStorage.setItem("floorplan-tab", t.id); }}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13,
              background: tab === t.id ? "#8B7355" : "transparent",
              color: tab === t.id ? "#fff" : "#bdb0a0",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Active />
    </div>
  );
}
