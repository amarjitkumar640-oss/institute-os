import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // Plain Node env (not VITE_-prefixed — this runs at config-load time, not
  // in the browser bundle) so built asset URLs match wherever this build
  // gets served from, e.g. "/exams/" in prod (see infra/Caddyfile's
  // handle_path /exams* -> exam-portal, same mechanism as apps/web's
  // BASE_PATH=/qa/ for the QA deploy). Defaults to domain root for local dev.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Distinct from apps/web's 3000 and apps/api's 4000 so both can run
    // side by side in local dev.
    port: 3100,
    proxy: {
      "/api": {
        target: process.env.VITE_API_URL ?? "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
