/**
 * Shared host-server identity and optional network simulation (dev only).
 */

import {
  displayHostUrl,
  githubHostModelsPublicUrl,
  isGitHubLatencyProxyUrl,
  isRealLatencyTestUrl,
} from "./deployedHost";

export interface HostServerInfo {
  kind: "local-dev" | "static" | "remote";
  /** Human label, e.g. "Local machine" or "us-east (simulated)" */
  regionLabel: string;
  /** Whether artificial latency is applied on the server */
  simulatedLatencyMs: number;
  /** What this endpoint mimics in production */
  mimics: string;
  /** What it does NOT simulate */
  doesNotSimulate: string[];
  serverUrl: string;
  modelsDir?: string;
}

export interface HostConnectionProbe {
  ok: boolean;
  baseUrl: string;
  roundTripMs: number;
  server: HostServerInfo | null;
  isLocalhost: boolean;
  isSameOrigin: boolean;
  isRealLatencyTest: boolean;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export function isLocalHostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function isSameOriginUrl(url: string): boolean {
  try {
    return new URL(url).origin === window.location.origin;
  } catch {
    return false;
  }
}

export async function probeHostConnection(baseUrl: string): Promise<HostConnectionProbe> {
  const base = trimSlash(baseUrl);
  const started = performance.now();

  try {
    let res = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    const roundTripMs = Math.round(performance.now() - started);

    if (res.ok) {
      const data = (await res.json()) as HostServerInfo & { ok?: boolean };
      const { ok: _ok, ...server } = data;
      return {
        ok: true,
        baseUrl: base,
        roundTripMs,
        server: server as HostServerInfo,
        isLocalhost: isLocalHostUrl(base),
        isSameOrigin: isSameOriginUrl(base),
        isRealLatencyTest: isRealLatencyTestUrl(base),
      };
    }

    // Static GitHub Pages / host-models has no /health — use manifest.json
    const manifestStart = performance.now();
    res = await fetch(`${base}/manifest.json`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const manifestRtt = Math.round(performance.now() - manifestStart);

    if (!res.ok) {
      return {
        ok: false,
        baseUrl: base,
        roundTripMs: manifestRtt,
        server: null,
        isLocalhost: isLocalHostUrl(base) && !isGitHubLatencyProxyUrl(base),
        isSameOrigin: isSameOriginUrl(base),
        isRealLatencyTest: isRealLatencyTestUrl(base),
      };
    }

    const manifest = (await res.json()) as { server?: HostServerInfo };
    const hostname = new URL(base, window.location.origin).hostname;
    const realTest = isRealLatencyTestUrl(base);
    const server: HostServerInfo = manifest.server ?? {
      kind: realTest ? "remote" : isSameOriginUrl(base) ? "static" : "remote",
      regionLabel: realTest
        ? isGitHubLatencyProxyUrl(base)
          ? `GitHub Pages (${githubHostModelsPublicUrl()})`
          : hostname
        : isLocalHostUrl(base)
          ? "Local machine"
          : hostname,
      simulatedLatencyMs: 0,
      mimics: realTest
        ? "Live GitHub Pages host-models (real network latency)"
        : "Static file host (manifest.json + GLB URLs)",
      doesNotSimulate: realTest
        ? ["Nothing — round-trip reflects your path to GitHub"]
        : ["Nothing — this is the real deployed path (latency is genuine for your network)"],
      serverUrl: base.startsWith("/") ? displayHostUrl(base) : base,
    };

    return {
      ok: true,
      baseUrl: base,
      roundTripMs: manifestRtt,
      server,
      isLocalhost: isLocalHostUrl(base) && !isGitHubLatencyProxyUrl(base),
      isSameOrigin: isSameOriginUrl(base),
      isRealLatencyTest: realTest,
    };
  } catch {
    return {
      ok: false,
      baseUrl: base,
      roundTripMs: Math.round(performance.now() - started),
      server: null,
      isLocalhost: isLocalHostUrl(base),
      isSameOrigin: isSameOriginUrl(base),
      isRealLatencyTest: isRealLatencyTestUrl(base),
    };
  }
}

export function describeConnectionProbe(probe: HostConnectionProbe): string {
  if (!probe.ok) {
    if (probe.isRealLatencyTest) {
      return `GitHub Pages unreachable (${probe.roundTripMs} ms) — deploy host-models (push to main) then retry`;
    }
    if (probe.isLocalhost) {
      return `Unreachable local host (${probe.roundTripMs} ms) — is npm run host-server running?`;
    }
    return `Unreachable (${probe.roundTripMs} ms) — check URL and network`;
  }

  const server = probe.server;
  if (!server) {
    return `Connected (${probe.roundTripMs} ms)`;
  }

  const parts = [
    server.regionLabel,
    `${probe.roundTripMs} ms round-trip`,
    server.kind === "local-dev" ? "local dev" : server.kind,
  ];

  if (server.simulatedLatencyMs > 0) {
    parts.push(`+${server.simulatedLatencyMs} ms simulated delay`);
  }

  return parts.join(" · ");
}

export function connectionProbeFootnote(probe: HostConnectionProbe): string {
  if (!probe.ok || !probe.server) return "";

  if (probe.server.kind === "local-dev" && probe.server.simulatedLatencyMs <= 0) {
    return "Local dev mimics the same manifest + file URLs as GitHub Pages. It does not add real geographic distance — for that, connect to your deployed GitHub Pages URL or set HOST_SIMULATE_LATENCY_MS on the dev server.";
  }

  if (probe.isLocalhost && probe.server.simulatedLatencyMs > 0) {
    return `Dev server is faking ${probe.server.simulatedLatencyMs} ms extra latency (${probe.server.regionLabel}). Real cross-country RTT varies with route and file size.`;
  }

  if (probe.isRealLatencyTest) {
    return "Real latency test — Vite proxies to GitHub Pages in dev; round-trip and import times reflect your network to github.io.";
  }

  if (!probe.isLocalhost && !probe.isSameOrigin) {
    return "Remote host — round-trip time reflects your network path to that server (state/country/CDN).";
  }

  return probe.server.mimics;
}
