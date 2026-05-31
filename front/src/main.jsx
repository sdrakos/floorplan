import React from "react";
import { createRoot } from "react-dom/client";
import "./storage-shim.js"; // must run before the component mounts
import FloorPlanTakeoff from "../floor-plan-takeoff.jsx";

// To preview another component, swap the import above for one of:
//   ../teuchos-builder-v3.jsx · ../teuchos-builder.jsx · ../construction-offer-manager.jsx
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <FloorPlanTakeoff />
  </React.StrictMode>
);
