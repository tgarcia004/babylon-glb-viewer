import { defineConfig } from "vite";

// Local dev uses "/". GitHub Actions sets VITE_BASE_PATH to "/<repo-name>/".
const base = process.env.VITE_BASE_PATH ?? "/";

const githubPagesOrigin = "https://tgarcia004.github.io";
const githubRepoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "babylon-glb-viewer";
const githubHostModelsPath = `/${githubRepoName}/host-models`;

export default defineConfig({
  base,
  root: ".",
  publicDir: "public",
  server: {
    open: true,
    proxy: {
      // Real latency test from localhost → GitHub Pages (no CORS; genuine network RTT).
      "/github-host": {
        target: githubPagesOrigin,
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/github-host/, githubHostModelsPath),
      },
    },
  },
});
