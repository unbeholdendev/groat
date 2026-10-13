import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: { outDir: "../dist", emptyOutDir: true },
  plugins: [
    tanstackRouter({ routesDirectory: "routes", generatedRouteTree: "routeTree.gen.ts", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  server: {
    host: true,
    port: 38697,
    strictPort: true,
    proxy: Object.fromEntries(["/api", "/sw.js", "/manifest.webmanifest"].map((p) => [p, "http://localhost:3000"])),
  },
});
