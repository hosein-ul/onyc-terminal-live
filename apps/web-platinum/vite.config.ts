import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // In development the API runs on :4000; in production the app is served next to it or given VITE_API_URL.
    proxy: { "/v1": "http://localhost:4000" },
  },
  build: { sourcemap: true },
});
