import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../static",  // built assets go to FastAPI's /static
    emptyOutDir: true,
  },
  server: {
    // Dev: proxy API calls to FastAPI running on port 8000
    proxy: {
      "/api":    "http://localhost:8000",
      "/login":  "http://localhost:8000",
      "/logout": "http://localhost:8000",
      "/media":  "http://localhost:8000",
    },
  },
});
