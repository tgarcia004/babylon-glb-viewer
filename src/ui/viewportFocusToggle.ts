const LAYOUT_ID = "layout";
const LATCH_ID = "fur-focus-latch";
const STORAGE_KEY = "fur-viewport-focus";

export type ViewportFocusMode = "studio" | "enlarged";

function getLayout(): HTMLElement | null {
  return document.getElementById(LAYOUT_ID);
}

function getLatch(): HTMLButtonElement | null {
  return document.getElementById(LATCH_ID) as HTMLButtonElement | null;
}

function notifyResize(): void {
  window.dispatchEvent(new Event("resize"));
}

function applyMode(mode: ViewportFocusMode): void {
  const layout = getLayout();
  const latch = getLatch();
  if (!layout || !latch) return;

  const enlarged = mode === "enlarged";
  layout.dataset.viewportFocus = mode;
  latch.setAttribute("aria-pressed", enlarged ? "true" : "false");
  latch.setAttribute(
    "aria-label",
    enlarged ? "Return to studio layout" : "Enlarge 3D view",
  );
  document.body.classList.toggle("is-viewport-enlarged", enlarged);
}

export function getViewportFocusMode(): ViewportFocusMode {
  const layout = getLayout();
  return layout?.dataset.viewportFocus === "enlarged" ? "enlarged" : "studio";
}

export function setViewportFocusMode(mode: ViewportFocusMode, persist = true): void {
  applyMode(mode);
  if (persist) {
    sessionStorage.setItem(STORAGE_KEY, mode);
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(notifyResize);
  });
}

export function toggleViewportFocus(): ViewportFocusMode {
  const next: ViewportFocusMode = getViewportFocusMode() === "enlarged" ? "studio" : "enlarged";
  setViewportFocusMode(next);
  return next;
}

export function initViewportFocusToggle(): void {
  const layout = getLayout();
  const latch = getLatch();
  if (!layout || !latch) return;

  const saved = sessionStorage.getItem(STORAGE_KEY) as ViewportFocusMode | null;
  if (saved === "enlarged" || saved === "studio") {
    applyMode(saved);
  } else {
    applyMode("studio");
  }

  latch.addEventListener("click", () => toggleViewportFocus());

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && getViewportFocusMode() === "enlarged") {
      setViewportFocusMode("studio");
      return;
    }
    if (e.key !== "f" && e.key !== "F") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
      return;
    }
    e.preventDefault();
    toggleViewportFocus();
  });

  layout.addEventListener("transitionend", (e) => {
    const t = e.target;
    if (t === layout || t === document.getElementById("fur-panel")) {
      notifyResize();
    }
  });
}
