import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [react(), tailwindcss()],
  server: { host: true, port: 38697, strictPort: true, proxy: { "/api": "http://localhost:3000" } },
});
