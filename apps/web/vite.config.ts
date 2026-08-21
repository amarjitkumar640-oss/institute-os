import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Plain Node env (not VITE_-prefixed — this runs at config-load time, not
  // in the browser bundle) so built asset URLs match wherever this build
  // gets served from, e.g. "/qa/" in the QA deploy. Defaults to domain root
  // for local dev / any deployment served at "/".
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@institute-os/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
