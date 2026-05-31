import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone dev host for the Claude-artifact components in this folder.
export default defineConfig({
  plugins: [react()],
  server: { port: 5180, open: true }, // 5173 is often taken by another local app
  esbuild: { loader: "jsx", include: /\.jsx?$/ },
});
