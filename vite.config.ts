import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config Vite adaptée pour Tauri : port fixe, HMR sur le même port,
// ignore le dossier src-tauri pour le watcher.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
