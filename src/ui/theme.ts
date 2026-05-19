import { Color4 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";

export type ViewerTheme = "studio" | "display";

const STORAGE_KEY = "fur-viewer-theme";

const CLEAR_COLORS: Record<ViewerTheme, Color4> = {
  studio: new Color4(0.047, 0.051, 0.063, 1),
  display: new Color4(0.93, 0.935, 0.94, 1),
};

let scene: Scene | null = null;

export function registerThemeScene(s: Scene): void {
  scene = s;
  const current = document.documentElement.dataset.theme;
  const theme: ViewerTheme = current === "display" ? "display" : "studio";
  scene.clearColor = CLEAR_COLORS[theme].clone();
}

export function applyViewerTheme(theme: ViewerTheme): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);

  if (scene) {
    scene.clearColor = CLEAR_COLORS[theme].clone();
  }

  for (const btn of document.querySelectorAll<HTMLButtonElement>(".theme-opt")) {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  }
}

export function initThemeSwitcher(): ViewerTheme {
  const saved = localStorage.getItem(STORAGE_KEY);
  const theme: ViewerTheme = saved === "display" ? "display" : "studio";

  for (const btn of document.querySelectorAll<HTMLButtonElement>(".theme-opt")) {
    btn.addEventListener("click", () => {
      const next = btn.dataset.theme as ViewerTheme | undefined;
      if (next) applyViewerTheme(next);
    });
  }

  applyViewerTheme(theme);
  return theme;
}
