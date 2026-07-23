import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves a project site under /<repo>/. Override with
// BASE_PATH at build time if the repo name differs.
const base = process.env.BASE_PATH ?? "/wpcapng/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
});
