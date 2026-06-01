import React from "react";
import { createRoot } from "react-dom/client";
import "./storage-shim.js"; // must run before the components mount
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
