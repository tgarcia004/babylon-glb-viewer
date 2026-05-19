import { defineConfig } from "vite";

// Local dev uses "/". GitHub Actions sets VITE_BASE_PATH to "/<repo-name>/".
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  root: ".",
  publicDir: "public",
  server: { open: true },
});
