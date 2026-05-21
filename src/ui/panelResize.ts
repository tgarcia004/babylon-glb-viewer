const STORAGE_KEY = "glb-studio-panel-width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 640;
const DEFAULT_WIDTH = 340;

function clampWidth(px: number): number {
  return Math.min(maxWidth(), Math.max(MIN_WIDTH, px));
}

function maxWidth(): number {
  return Math.min(MAX_WIDTH, Math.floor(window.innerWidth * 0.58));
}

function readPanelWidthPx(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--panel-width").trim();
  const parsed = parseInt(raw, 10);
  return clampWidth(Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH);
}

function applyPanelWidth(px: number): void {
  const width = clampWidth(px);
  document.documentElement.style.setProperty("--panel-width", `${width}px`);
}

/** Drag the inspector panel's left edge to resize. */
export function initPanelResize(): void {
  const handle = document.getElementById("panel-resize-handle");
  const layout = document.getElementById("layout");
  const panel = document.getElementById("fur-panel");
  if (!handle || !layout || !panel) return;

  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (saved) {
    const w = parseInt(saved, 10);
    if (Number.isFinite(w)) {
      applyPanelWidth(w);
    }
  }

  let dragging = false;
  let startX = 0;
  let startWidth = DEFAULT_WIDTH;

  const stopDrag = (): void => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("panel-resizing");
    layout.classList.remove("is-panel-resizing");
    sessionStorage.setItem(STORAGE_KEY, String(readPanelWidthPx()));
  };

  handle.addEventListener("pointerdown", (e) => {
    if (layout.dataset.viewportFocus === "enlarged") return;
    if (e.button !== 0) return;

    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("is-dragging");
    document.body.classList.add("panel-resizing");
    layout.classList.add("is-panel-resizing");
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const delta = startX - e.clientX;
    applyPanelWidth(startWidth + delta);
  });

  handle.addEventListener("pointerup", stopDrag);
  handle.addEventListener("pointercancel", stopDrag);

  window.addEventListener("resize", () => {
    applyPanelWidth(readPanelWidthPx());
  });

  handle.addEventListener("keydown", (e) => {
    if (layout.dataset.viewportFocus === "enlarged") return;
    const step = e.shiftKey ? 40 : 16;
    if (e.key === "ArrowLeft") {
      applyPanelWidth(readPanelWidthPx() + step);
      sessionStorage.setItem(STORAGE_KEY, String(readPanelWidthPx()));
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      applyPanelWidth(readPanelWidthPx() - step);
      sessionStorage.setItem(STORAGE_KEY, String(readPanelWidthPx()));
      e.preventDefault();
    }
  });
}
