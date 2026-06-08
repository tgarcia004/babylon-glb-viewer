/** Published GitHub Pages host for this repo (see .github/workflows/deploy.yml). */
export const GITHUB_PAGES_USER = "tgarcia004";
export const GITHUB_PAGES_REPO = "babylon-glb-viewer";

/** Vite dev proxy mount — browser same-origin, server fetches GitHub (real RTT). */
export const GITHUB_HOST_DEV_PROXY_PATH = "/github-host";

export function githubHostModelsPublicUrl(): string {
  const fromEnv = import.meta.env.VITE_GITHUB_HOST_MODELS_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  return `https://${GITHUB_PAGES_USER}.github.io/${GITHUB_PAGES_REPO}/host-models`;
}

/**
 * URL used for real latency testing.
 * - Dev: `/github-host` (Vite proxy → GitHub Pages)
 * - Prod on Pages: same-origin `/host-models`
 */
export function realLatencyTestHostUrl(): string {
  if (import.meta.env.DEV) {
    return GITHUB_HOST_DEV_PROXY_PATH;
  }
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  return `${base}/host-models`;
}

export function isGitHubLatencyProxyUrl(url: string): boolean {
  const trimmed = url.trim();
  if (trimmed === GITHUB_HOST_DEV_PROXY_PATH || trimmed.endsWith(GITHUB_HOST_DEV_PROXY_PATH)) {
    return true;
  }
  try {
    const path = new URL(trimmed, window.location.origin).pathname.replace(/\/+$/, "");
    return path === GITHUB_HOST_DEV_PROXY_PATH || path.endsWith(`${GITHUB_HOST_DEV_PROXY_PATH}`);
  } catch {
    return false;
  }
}

export function isGitHubPagesHostUrl(url: string): boolean {
  try {
    return new URL(url, window.location.origin).hostname.endsWith("github.io");
  } catch {
    return url.includes("github.io");
  }
}

export function isRealLatencyTestUrl(url: string): boolean {
  return isGitHubLatencyProxyUrl(url) || isGitHubPagesHostUrl(url);
}

export function displayHostUrl(url: string): string {
  if (url.startsWith("/")) {
    return `${window.location.origin}${url}`;
  }
  return url;
}
