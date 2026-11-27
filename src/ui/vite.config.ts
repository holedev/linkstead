import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The UI is built as static files the Worker serves under `/app` - hence `base`, and an output
 * folder ending in `app` so a file's path on disk is its path in the address.
 */
export default defineConfig({
  base: "/app/",
  build: { emptyOutDir: true, outDir: "../../dist/client/app" },
  plugins: [react(), tailwindcss()],
  // `@/` is `src/ui/`, the alias the shadcn components are written against.
  resolve: { alias: { "@": import.meta.dirname } },
  root: import.meta.dirname,
  // `pnpm dev:ui` beside `pnpm dev`: the pages come from Vite, the API from the local Worker.
  server: { proxy: { "/api": "http://127.0.0.1:8787" } }
});
