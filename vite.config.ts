import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // En dev de Vite puro, proxeamos /api al worker de wrangler (puerto 8788).
      "/api": "http://127.0.0.1:8788",
    },
  },
});
