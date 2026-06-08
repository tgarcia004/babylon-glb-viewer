import {
  clearSavedHostUrl,
  defaultDevHostUrl,
  defaultStaticHostUrl,
  fetchHostManifest,
  fetchHostModel,
  formatHostModelSize,
  getSavedHostMode,
  resolveHostBaseUrl,
  saveHostPreferences,
  type HostConnectionMode,
  type HostManifest,
  type HostModelEntry,
} from "../hosting/hostClient";
import {
  connectionProbeFootnote,
  describeConnectionProbe,
  probeHostConnection,
  type HostConnectionProbe,
} from "../hosting/hostProbe";
import {
  displayHostUrl,
  githubHostModelsPublicUrl,
  isGitHubLatencyProxyUrl,
  realLatencyTestHostUrl,
} from "../hosting/deployedHost";
import {
  disposeAllHostThumbnails,
  HostModelThumbnail,
  trackHostThumbnail,
} from "../hosting/hostModelPreview";
import {
  BENCHMARK_MODEL_LABEL,
  isBenchmarkModel,
} from "../hosting/benchmarkModel";
import { dispatchModelFile } from "./modelFileDrop";

let dialogEl: HTMLDialogElement | null = null;
let statusEl: HTMLElement | null = null;
let gridEl: HTMLElement | null = null;
let urlInputEl: HTMLInputElement | null = null;
let modeSelectEl: HTMLSelectElement | null = null;
let catalogHintEl: HTMLElement | null = null;
let refreshBtnEl: HTMLButtonElement | null = null;
let probeEl: HTMLElement | null = null;
let latencyTargetEl: HTMLElement | null = null;

let lastProbe: HostConnectionProbe | null = null;

let activeBaseUrl = resolveHostBaseUrl();
let activeMode: HostConnectionMode = getSavedHostMode();
let manifest: HostManifest | null = null;
let loading = false;

function ensureDialog(): HTMLDialogElement {
  if (dialogEl) return dialogEl;

  dialogEl = document.createElement("dialog");
  dialogEl.id = "host-model-dialog";
  dialogEl.className = "host-model-dialog";
  dialogEl.innerHTML = `
    <form method="dialog" class="host-model-card">
      <header class="host-model-head">
        <div>
          <h2 class="host-model-title">Hosting server</h2>
          <p class="host-model-subtitle">Browse GLB files from the shared models folder</p>
        </div>
        <button type="button" class="host-model-close" aria-label="Close">×</button>
      </header>

      <div class="host-model-connect">
        <label class="host-model-field">
          <span class="host-model-field-label">Server URL</span>
          <input type="text" class="host-model-url" placeholder="http://127.0.0.1:3847" spellcheck="false" autocapitalize="off" />
        </label>
        <label class="host-model-field host-model-field--compact">
          <span class="host-model-field-label">Mode</span>
          <select class="host-model-mode">
            <option value="auto">Auto</option>
            <option value="dev-server">Local dev server</option>
            <option value="github-pages">GitHub Pages (real latency)</option>
            <option value="static">Same-origin / static</option>
          </select>
        </label>
        <div class="host-model-connect-actions">
          <button type="button" class="host-model-btn host-model-btn--primary host-model-connect-btn">Connect</button>
          <button type="button" class="host-model-btn host-model-btn--accent host-model-latency-btn">
            Real latency test
          </button>
          <button type="button" class="host-model-btn host-model-btn--secondary host-model-reset-btn">Reset URL</button>
        </div>
        <p class="host-model-local-note hint">
          <strong>Local models:</strong> run <code>npm run host-server</code> or <code>npm run dev:all</code>.
          GLBs in <code>hosting/models/</code> stay on your PC — they are not uploaded to GitHub.
        </p>
        <p class="host-model-latency-target hint"></p>
      </div>

      <p class="host-model-status hint" role="status"></p>

      <div class="host-model-probe" hidden>
        <p class="host-model-probe-title">Connection profile</p>
        <dl class="host-model-probe-grid"></dl>
        <p class="host-model-probe-note hint"></p>
      </div>

      <section class="host-model-catalog" aria-label="Available models">
        <div class="host-model-catalog-head">
          <div>
            <p class="host-model-catalog-title">Available models</p>
            <p class="host-model-catalog-hint hint" hidden>
              Double-click a thumbnail to import. Use <strong>Latency benchmark</strong> on GitHub to test real download speed.
            </p>
          </div>
          <button type="button" class="host-model-btn host-model-btn--secondary host-model-refresh-btn">Refresh</button>
        </div>
        <div class="host-model-grid" role="list"></div>
      </section>

      <footer class="host-model-foot">
        <p class="hint host-model-foot-hint">
          Double-click a thumbnail to import · Local server: <code>127.0.0.1:3847</code>
        </p>
        <button type="button" class="host-model-btn host-model-btn--secondary host-model-cancel">Cancel</button>
      </footer>
    </form>
  `;

  document.body.appendChild(dialogEl);

  statusEl = dialogEl.querySelector(".host-model-status");
  gridEl = dialogEl.querySelector(".host-model-grid");
  catalogHintEl = dialogEl.querySelector(".host-model-catalog-hint");
  probeEl = dialogEl.querySelector(".host-model-probe");
  latencyTargetEl = dialogEl.querySelector(".host-model-latency-target");
  refreshBtnEl = dialogEl.querySelector(".host-model-refresh-btn");
  urlInputEl = dialogEl.querySelector(".host-model-url");
  modeSelectEl = dialogEl.querySelector(".host-model-mode");

  refreshBtnEl?.addEventListener("click", () => {
    void connectAndRefresh();
  });

  dialogEl.querySelector(".host-model-close")?.addEventListener("click", () => closeHostModelBrowser());
  dialogEl.querySelector(".host-model-cancel")?.addEventListener("click", () => closeHostModelBrowser());
  dialogEl.querySelector(".host-model-connect-btn")?.addEventListener("click", () => {
    void connectAndRefresh();
  });
  dialogEl.querySelector(".host-model-latency-btn")?.addEventListener("click", () => {
    void connectRealLatencyTest();
  });
  dialogEl.querySelector(".host-model-reset-btn")?.addEventListener("click", () => {
    clearSavedHostUrl();
    activeMode = "auto";
    if (modeSelectEl) modeSelectEl.value = activeMode;
    activeBaseUrl = resolveHostBaseUrl(activeMode);
    if (urlInputEl) urlInputEl.value = activeBaseUrl;
    setStatus("Using default server URL.");
    void connectAndRefresh();
  });

  dialogEl.addEventListener("click", (e) => {
    if (e.target === dialogEl) {
      closeHostModelBrowser();
    }
  });

  dialogEl.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeHostModelBrowser();
  });

  return dialogEl;
}

function setStatus(message: string, isError = false): void {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function renderProbe(probe: HostConnectionProbe | null): void {
  if (!probeEl) return;
  const grid = probeEl.querySelector(".host-model-probe-grid");
  const note = probeEl.querySelector(".host-model-probe-note");
  if (!grid || !note) return;

  if (!probe?.ok) {
    probeEl.hidden = true;
    grid.replaceChildren();
    note.textContent = "";
    return;
  }

  probeEl.hidden = false;
  grid.replaceChildren();

  const rows: [string, string][] = [
    ["Endpoint", probe.baseUrl],
    ["Region label", probe.server?.regionLabel ?? "Unknown"],
    ["Round-trip", `${probe.roundTripMs} ms`],
    ["Host type", probe.server?.kind ?? "unknown"],
  ];

  if (probe.server && probe.server.simulatedLatencyMs > 0) {
    rows.push(["Simulated delay", `+${probe.server.simulatedLatencyMs} ms per request`]);
  }

  rows.push([
    "Geography",
    probe.isRealLatencyTest
      ? "GitHub Pages — real network to github.io"
      : probe.isLocalhost
        ? "Same machine (not another state/country)"
        : probe.isSameOrigin
          ? "Same site origin"
          : "Remote network path (real distance applies)",
  ]);

  for (const [label, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    grid.append(dt, dd);
  }

  note.textContent = connectionProbeFootnote(probe);
}

function setCatalogHint(visible: boolean, hasModels: boolean): void {
  if (!catalogHintEl) return;
  catalogHintEl.hidden = !visible || !hasModels;
}

function renderProductGrid(models: HostModelEntry[], options?: { connected?: boolean }): void {
  if (!gridEl) return;

  disposeAllHostThumbnails();
  gridEl.replaceChildren();

  const connected = options?.connected ?? false;

  if (models.length === 0) {
    const empty = document.createElement("p");
    empty.className = "host-model-grid-empty";
    empty.textContent = connected
      ? "No GLB files on the server yet. Add files to hosting/models/ and click Refresh."
      : "Connect to the hosting server to browse models.";
    gridEl.appendChild(empty);
    return;
  }

  for (const entry of models) {
    const isBench = isBenchmarkModel(entry);
    const card = document.createElement("article");
    card.className = isBench ? "host-product-card host-product-card--benchmark" : "host-product-card";
    card.setAttribute("role", "listitem");

    const thumbBtn = document.createElement("button");
    thumbBtn.type = "button";
    thumbBtn.className = "host-product-thumb";
    thumbBtn.title = isBench
      ? "Double-click to run GitHub latency import test"
      : `Double-click to import ${entry.name}`;
    thumbBtn.setAttribute("aria-label", isBench ? "Import latency benchmark" : `Import ${entry.name}`);

    const canvas = document.createElement("canvas");
    canvas.className = "host-product-canvas";
    canvas.width = 160;
    canvas.height = 128;

    const loading = document.createElement("span");
    loading.className = "host-product-loading";
    loading.textContent = "Loading…";
    loading.hidden = true;

    if (isBench) {
      const badge = document.createElement("span");
      badge.className = "host-product-badge";
      badge.textContent = "GitHub test";
      thumbBtn.append(badge);
    }

    thumbBtn.append(canvas, loading);

    thumbBtn.addEventListener("dblclick", (e) => {
      e.preventDefault();
      void importHostedModel(entry);
    });

    const name = document.createElement("h3");
    name.className = "host-product-name";
    name.textContent = isBench ? entry.label ?? BENCHMARK_MODEL_LABEL : entry.name;

    const meta = document.createElement("p");
    meta.className = "host-product-meta";
    meta.textContent = isBench
      ? `${formatHostModelSize(entry.sizeBytes)} · safe sample cube`
      : formatHostModelSize(entry.sizeBytes);

    card.append(thumbBtn, name, meta);
    gridEl.appendChild(card);

    const thumbnail = new HostModelThumbnail(canvas, loading);
    trackHostThumbnail(thumbnail);
    void thumbnail.load(activeBaseUrl, entry);
  }
}

function updateLatencyTargetHint(): void {
  if (!latencyTargetEl) return;
  const proxy = realLatencyTestHostUrl();
  const remote = githubHostModelsPublicUrl();
  if (import.meta.env.DEV) {
    latencyTargetEl.textContent = `Real latency test → ${remote}. Double-click the benchmark cube to measure GitHub import time.`;
  } else {
    latencyTargetEl.textContent = `Real latency test uses ${displayHostUrl(proxy)}. Double-click the benchmark cube to measure import time from GitHub.`;
  }
}

async function connectRealLatencyTest(): Promise<void> {
  activeMode = "github-pages";
  activeBaseUrl = realLatencyTestHostUrl();
  if (modeSelectEl) modeSelectEl.value = activeMode;
  if (urlInputEl) urlInputEl.value = activeBaseUrl;
  saveHostPreferences(activeBaseUrl, activeMode);
  await connectAndRefresh();
}

async function connectAndRefresh(): Promise<void> {
  if (loading) return;

  const mode = (modeSelectEl?.value as HostConnectionMode) ?? "auto";
  const typedUrl = urlInputEl?.value.trim();
  activeMode = mode;

  if (typedUrl) {
    activeBaseUrl = typedUrl.replace(/\/+$/, "");
  } else {
    activeBaseUrl = resolveHostBaseUrl(mode);
    if (urlInputEl) urlInputEl.value = activeBaseUrl;
  }

  saveHostPreferences(activeBaseUrl, activeMode);

  loading = true;
  if (refreshBtnEl) refreshBtnEl.disabled = true;
  setStatus("Connecting…");
  setCatalogHint(false, false);
  renderProbe(null);
  renderProductGrid(manifest?.models ?? [], { connected: false });

  try {
    lastProbe = await probeHostConnection(activeBaseUrl);
    if (!lastProbe.ok) {
      throw new Error(`Could not reach ${activeBaseUrl}`);
    }

    manifest = await fetchHostManifest(activeBaseUrl);
    renderProbe(lastProbe);
    setCatalogHint(true, manifest.models.length > 0);
    const profile = describeConnectionProbe(lastProbe);
    if (manifest.models.length > 0) {
      const hasBench = manifest.models.some(isBenchmarkModel);
      const viaGithub = lastProbe?.isRealLatencyTest ?? false;
      if (viaGithub && hasBench) {
        setStatus(`Connected — ${profile}. Double-click Latency benchmark to test GitHub import speed.`);
      } else {
        setStatus(`Connected — ${profile}. Double-click a thumbnail to import.`);
      }
    } else {
      setStatus(`Connected — ${profile}. No models yet — add GLBs to hosting/models/ and Refresh.`);
    }
  } catch (err) {
    manifest = null;
    lastProbe = null;
    renderProbe(null);
    setCatalogHint(false, false);
    const msg = err instanceof Error ? err.message : "Connection failed";
    setStatus(msg, true);
  } finally {
    loading = false;
    if (refreshBtnEl) refreshBtnEl.disabled = false;
    renderProductGrid(manifest?.models ?? [], { connected: manifest !== null });
  }
}

async function importHostedModel(entry: HostModelEntry): Promise<void> {
  if (loading) return;
  loading = true;
  const isBench = isBenchmarkModel(entry);
  setStatus(isBench ? "Running GitHub latency import test…" : `Importing ${entry.name}…`);

  const downloadStart = performance.now();
  try {
    const file = await fetchHostModel(entry, activeBaseUrl);
    const downloadMs = Math.round(performance.now() - downloadStart);
    const via = isGitHubLatencyProxyUrl(activeBaseUrl) || lastProbe?.isRealLatencyTest ? " via GitHub" : "";

    if (isBench) {
      void file;
      setStatus(`Latency test complete${via} — download ${downloadMs} ms (benchmark not loaded into viewer)`);
      loading = false;
      return;
    }

    dispatchModelFile(file);
    setStatus(`Loaded ${entry.name}${via} — download ${downloadMs} ms`);
    closeHostModelBrowser();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    setStatus(msg, true);
    loading = false;
    renderProductGrid(manifest?.models ?? [], { connected: manifest !== null });
  }
}

export function openHostModelBrowser(): void {
  const dialog = ensureDialog();
  activeMode = getSavedHostMode();
  activeBaseUrl = resolveHostBaseUrl(activeMode);

  if (modeSelectEl) modeSelectEl.value = activeMode;
  if (urlInputEl) {
    urlInputEl.value = activeBaseUrl;
    urlInputEl.placeholder = import.meta.env.DEV ? defaultDevHostUrl() : defaultStaticHostUrl();
  }
  updateLatencyTargetHint();

  if (!dialog.open) {
    dialog.showModal();
  }

  void connectAndRefresh();
}

export function closeHostModelBrowser(): void {
  disposeAllHostThumbnails();
  dialogEl?.close();
}

export function initHostModelBrowser(): void {
  ensureDialog();
}
