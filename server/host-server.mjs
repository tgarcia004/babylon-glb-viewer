/**
 * Local dev host server — mimics static GitHub Pages hosting for GLB files.
 * Serves hosting/models with CORS so the Vite app can fetch models in parallel.
 */

import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const modelsDir = path.join(root, "hosting", "models");
const benchmarkDir = path.join(root, "public", "host-models");
const BENCHMARK_FILE = "benchmark-latency.glb";
const BENCHMARK_PATH = path.join(benchmarkDir, BENCHMARK_FILE);
const PORT = Number(process.env.HOST_SERVER_PORT || 3847);

/** Optional dev-only delay to approximate remote load times (ms). */
const SIMULATED_LATENCY_MS = Math.max(0, Number(process.env.HOST_SIMULATE_LATENCY_MS || 0));
const SIMULATED_REGION = process.env.HOST_SIMULATE_REGION?.trim() || "Local machine";

const SERVER_INFO = {
  kind: "local-dev",
  regionLabel: SIMULATED_REGION,
  simulatedLatencyMs: SIMULATED_LATENCY_MS,
  mimics: "Static file host (manifest.json + GLB URLs) — same contract as GitHub Pages /host-models/",
  doesNotSimulate: [
    "Real geographic routing or CDN edge selection",
    "DNS + TLS unless you use a remote URL",
    "Bandwidth caps and packet loss",
  ],
  serverUrl: `http://127.0.0.1:${PORT}`,
  modelsDir,
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withOptionalLatency(run) {
  if (SIMULATED_LATENCY_MS > 0) {
    await delay(SIMULATED_LATENCY_MS);
  }
  return run();
}

const MIME = {
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".json": "application/json",
};

const MODEL_EXT = /\.(glb|gltf)$/i;

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

function scanModels() {
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }

  const user = fs
    .readdirSync(modelsDir)
    .filter((name) => MODEL_EXT.test(name) && name !== BENCHMARK_FILE)
    .map((name) => {
      const filePath = path.join(modelsDir, name);
      const stat = fs.statSync(filePath);
      return {
        name,
        url: name,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const bench = benchmarkEntry();
  return bench ? [bench, ...user] : user;
}

function resolveModelPath(fileName) {
  if (fileName === BENCHMARK_FILE && fs.existsSync(BENCHMARK_PATH)) {
    return BENCHMARK_PATH;
  }
  const safePath = path.join(modelsDir, fileName);
  if (!safePath.startsWith(modelsDir)) {
    return null;
  }
  return safePath;
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-GLB-Studio-Host": SERVER_INFO.kind,
    "X-GLB-Studio-Region": SERVER_INFO.regionLabel,
    "X-GLB-Studio-Simulated-Latency-Ms": String(SIMULATED_LATENCY_MS),
  });
  res.end(payload);
}

function sendText(res, status, message) {
  res.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(message);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const stream = fs.createReadStream(filePath);
  stream.on("error", () => sendText(res, 404, "File not found"));
  res.writeHead(200, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "X-GLB-Studio-Host": SERVER_INFO.kind,
    "X-GLB-Studio-Region": SERVER_INFO.regionLabel,
    "X-GLB-Studio-Simulated-Latency-Ms": String(SIMULATED_LATENCY_MS),
  });
  stream.pipe(res);
}

const server = http.createServer((req, res) => {
  void withOptionalLatency(async () => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (req.method !== "GET" || !req.url) {
      sendText(res, 405, "Method not allowed");
      return;
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/" || pathname === "/health") {
      sendJson(res, 200, { ok: true, ...SERVER_INFO });
      return;
    }

    if (pathname === "/manifest.json") {
      sendJson(res, 200, {
        version: 1,
        generatedAt: new Date().toISOString(),
        server: SERVER_INFO,
        models: scanModels(),
      });
      return;
    }

    const fileName = path.basename(pathname);
    if (!MODEL_EXT.test(fileName)) {
      sendText(res, 404, "Not found");
      return;
    }

    const safePath = resolveModelPath(fileName);
    if (!safePath || !fs.existsSync(safePath)) {
      sendText(res, 404, "Model not found");
      return;
    }

    sendFile(res, safePath);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  const count = scanModels().length;
  console.log(`GLB host server listening on http://127.0.0.1:${PORT}`);
  console.log(`Serving models from ${modelsDir} (${count} file(s))`);
  console.log(`Region label: ${SIMULATED_REGION}`);
  if (SIMULATED_LATENCY_MS > 0) {
    console.log(`Simulated latency: +${SIMULATED_LATENCY_MS} ms per request`);
  } else {
    console.log("Simulated latency: off (set HOST_SIMULATE_LATENCY_MS to fake remote delay)");
  }
});
