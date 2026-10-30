import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import path from "node:path";

export default defineConfig({
  plugins: [react(), lingui({ macroTransform: true })],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 1421,
    strictPort: true,
  },
  clearScreen: false,
});
