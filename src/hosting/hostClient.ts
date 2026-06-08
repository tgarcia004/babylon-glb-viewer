export const HOST_MANIFEST_VERSION = 1 as const;

import { probeHostConnection } from "./hostProbe";
import { realLatencyTestHostUrl } from "./deployedHost";

export interface HostModelEntry {
  name: string;
  url: string;
  sizeBytes: number;
  updatedAt?: string;
  /** `latency-benchmark` = tiny public sample on GitHub Pages for network tests */
  purpose?: string;
  label?: string;
}

export interface HostManifest {
  version: typeof HOST_MANIFEST_VERSION;
  generatedAt: string;
  models: HostModelEntry[];
}

export type HostConnectionMode = "auto" | "dev-server" | "static" | "github-pages";

const STORAGE_KEY = "glb-studio-host-base-url";
const STORAGE_MODE_KEY = "glb-studio-host-mode";

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** Default parallel dev server URL (see server/host-server.mjs). */
export function defaultDevHostUrl(): string {
  return "http://127.0.0.1:3847";
}

/** Static folder published with GitHub Pages / Vite public dir. */
export function defaultStaticHostUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/host-models`;
}

export function resolveHostBaseUrl(mode: HostConnectionMode = "auto"): string {
  const saved = localStorage.getItem(STORAGE_KEY)?.trim();
  if (saved) {
    return trimSlash(saved);
  }

  const envUrl = import.meta.env.VITE_HOST_SERVER_URL?.trim();
  if (envUrl) {
    return trimSlash(envUrl);
  }

  if (mode === "dev-server") {
    return defaultDevHostUrl();
  }
  if (mode === "static") {
    return defaultStaticHostUrl();
  }
  if (mode === "github-pages") {
    return realLatencyTestHostUrl();
  }

  if (import.meta.env.DEV) {
    return defaultDevHostUrl();
  }
  return defaultStaticHostUrl();
}

export function getSavedHostMode(): HostConnectionMode {
  const raw = localStorage.getItem(STORAGE_MODE_KEY);
  if (raw === "dev-server" || raw === "static" || raw === "auto" || raw === "github-pages") {
    return raw;
  }
  return "auto";
}

export function saveHostPreferences(baseUrl: string, mode: HostConnectionMode): void {
  localStorage.setItem(STORAGE_KEY, trimSlash(baseUrl));
  localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function clearSavedHostUrl(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function formatHostModelSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function fetchHostManifest(baseUrl?: string): Promise<HostManifest> {
  const base = baseUrl ?? resolveHostBaseUrl();
  const res = await fetch(`${base}/manifest.json`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Host server responded ${res.status}`);
  }
  const data = (await res.json()) as HostManifest;
  if (!Array.isArray(data.models)) {
    throw new Error("Invalid manifest: missing models array");
  }
  return data;
}

export async function probeHostServer(baseUrl: string): Promise<boolean> {
  const probe = await probeHostConnection(baseUrl);
  return probe.ok;
}

function mimeForModel(name: string): string {
  return name.toLowerCase().endsWith(".gltf") ? "model/gltf+json" : "model/gltf-binary";
}

export function hostModelAssetUrls(
  baseUrl: string,
  entry: HostModelEntry,
): { rootUrl: string; fileName: string } {
  const base = trimSlash(baseUrl);
  const segments = entry.url.split("/").map((part) => encodeURIComponent(part));
  const fileName = segments[segments.length - 1] ?? encodeURIComponent(entry.name);
  const dir = segments.slice(0, -1);
  const rootUrl = dir.length > 0 ? `${base}/${dir.join("/")}/` : `${base}/`;
  return { rootUrl, fileName };
}

export async function fetchHostModel(entry: HostModelEntry, baseUrl?: string): Promise<File> {
  const base = baseUrl ?? resolveHostBaseUrl();
  const { rootUrl, fileName } = hostModelAssetUrls(base, entry);
  const res = await fetch(`${rootUrl}${fileName}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to download ${entry.name} (${res.status})`);
  }
  const blob = await res.blob();
  return new File([blob], entry.name, { type: mimeForModel(entry.name) });
}
