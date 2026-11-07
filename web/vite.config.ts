import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run dev` proxies /api to the deployed site, so the UI can be developed against real data.
export default defineConfig({
  plugins: [react()],
  server: {
    fs: { allow: [".."] },
    proxy: { "/api": { target: process.env.API_ORIGIN ?? "https://traffic.isy.sh", changeOrigin: true } },
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"] } } },
  },
});
