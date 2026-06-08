/**
 * Scan hosting/models and publish manifest + copies to public/host-models
 * for Vite / GitHub Pages static hosting.
 * Always includes the committed benchmark-latency.glb for GitHub latency tests.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "hosting", "models");
const outDir = path.join(root, "public", "host-models");
const BENCHMARK_FILE = "benchmark-latency.glb";
const BENCHMARK_PATH = path.join(outDir, BENCHMARK_FILE);

const MODEL_EXT = /\.(glb|gltf)$/i;
const PROTECTED_FILES = new Set([BENCHMARK_FILE, "manifest.json", ".gitkeep", "BENCHMARK.md"]);

function benchmarkEntry() {
  if (!fs.existsSync(BENCHMARK_PATH)) {
    return null;
  }
  const stat = fs.statSync(BENCHMARK_PATH);
  return {
    name: BENCHMARK_FILE,
    url: BENCHMARK_FILE,
    sizeBytes: stat.size,
    updatedAt: stat.mtime.toISOString(),
    purpose: "latency-benchmark",
    label: "Latency benchmark (GitHub)",
  };
}

function scanModels(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => MODEL_EXT.test(name) && name !== BENCHMARK_FILE)
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        url: name,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function main() {
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  const userModels = scanModels(srcDir);
  const bench = benchmarkEntry();

  for (const entry of userModels) {
    fs.copyFileSync(path.join(srcDir, entry.name), path.join(outDir, entry.name));
  }

  const existing = fs.readdirSync(outDir);
  for (const name of existing) {
    if (PROTECTED_FILES.has(name)) continue;
    if (!userModels.some((m) => m.name === name)) {
      fs.unlinkSync(path.join(outDir, name));
    }
  }

  const models = bench ? [bench, ...userModels] : userModels;

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    models,
  };

  fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  const userCount = userModels.length;
  const benchNote = bench ? " + benchmark" : "";
  console.log(`Host manifest: ${userCount} local model(s)${benchNote} → public/host-models/`);
}

main();
