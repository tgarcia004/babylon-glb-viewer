# Hosted GLB models (local only)

Put `.glb` or `.gltf` files in this folder. **They are not uploaded to GitHub** — `.gitignore` excludes them from git.

## Recommended workflow (models stay on your PC)

1. Add models to this folder (`hosting/models/`).
2. Start the local host server and app:
   ```bash
   npm run dev:all
   ```
3. In the app, open **Browse hosting server** — it connects to `http://127.0.0.1:3847` by default.
4. Double-click a thumbnail to import into the viewer.

You can also use the **live GitHub Pages app** in your browser while the local server runs on the same PC:

1. Open `https://tgarcia004.github.io/babylon-glb-viewer/`
2. Run `npm run host-server` (or `npm run dev:all`)
3. **Browse hosting server** → set URL to `http://127.0.0.1:3847` → Connect

GitHub hosts the viewer only; models are served from your computer.

## GitHub latency benchmark (no proprietary models)

A tiny **Khronos sample cube** (`benchmark-latency.glb`) is committed for network testing only. It deploys to GitHub Pages; your GLBs do not.

1. Open the live GitHub Pages app (or local app with **Real latency test**).
2. **Browse hosting server** → **Real latency test**.
3. Double-click **Latency benchmark** — measures full download time from GitHub without loading into the viewer.

Your models: still use `http://127.0.0.1:3847` with `npm run host-server`.

## About “downloading”

The browser must **load model bytes into memory** to display them (via localhost). That is not the same as:

- Uploading files to GitHub
- Saving files to your Downloads folder

Data flows: **your folder → local server → browser memory → 3D viewer**. Nothing is stored in the repo.

## Optional: sync manifest before push

`push-to-github.bat` runs `npm run host:sync` to refresh `public/host-models/manifest.json` locally. Model files themselves remain gitignored and are not pushed.

## If models were committed before

To stop tracking them without deleting local files:

```bash
git rm --cached hosting/models/*.glb public/host-models/*.glb
```

Then commit and push.
