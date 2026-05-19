import {
  applyStudioLighting,
  type StudioLightRig,
  type StudioLightingState,
  type LightParams,
} from "./studioLights";
import type { Scene } from "@babylonjs/core/scene";

type LightRole = "key" | "fill" | "rim";

function bindRange(
  panel: HTMLElement,
  inputId: string,
  valId: string,
  format: (v: number) => string,
  onInput: (v: number) => void,
): void {
  const input = panel.querySelector<HTMLInputElement>(`#${inputId}`);
  const valEl = panel.querySelector<HTMLElement>(`#${valId}`);
  if (!input) return;
  const sync = () => {
    const v = parseFloat(input.value);
    if (valEl) valEl.textContent = format(v);
    onInput(v);
  };
  input.addEventListener("input", sync);
  sync();
}

function bindCheckbox(panel: HTMLElement, id: string, onChange: (on: boolean) => void): void {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return;
  const sync = () => onChange(el.checked);
  el.addEventListener("change", sync);
  sync();
}

function bindColor(panel: HTMLElement, id: string, onChange: (hex: string) => void): void {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return;
  const sync = () => onChange(el.value);
  el.addEventListener("input", sync);
  sync();
}

function wireLight(
  panel: HTMLElement,
  role: LightRole,
  params: LightParams,
  apply: () => void,
): void {
  const p = role;
  bindCheckbox(panel, `light-${p}-enabled`, (on) => {
    params.enabled = on;
    apply();
  });
  bindRange(panel, `light-${p}-az`, `light-${p}-az-val`, (v) => `${Math.round(v)}°`, (v) => {
    params.azimuth = v;
    apply();
  });
  bindRange(panel, `light-${p}-el`, `light-${p}-el-val`, (v) => `${Math.round(v)}°`, (v) => {
    params.elevation = v;
    apply();
  });
  bindRange(panel, `light-${p}-int`, `light-${p}-int-val`, (v) => v.toFixed(2), (v) => {
    params.intensity = v;
    apply();
  });
  bindColor(panel, `light-${p}-color`, (hex) => {
    params.color = hex;
    apply();
  });
}

export function wireStudioLightingPanel(
  panel: HTMLElement,
  scene: Scene,
  rig: StudioLightRig,
  state: StudioLightingState,
): void {
  const apply = () => applyStudioLighting(rig, scene, state);

  wireLight(panel, "key", state.key, apply);
  wireLight(panel, "fill", state.fill, apply);
  wireLight(panel, "rim", state.rim, apply);

  bindRange(panel, "light-ambient", "light-ambient-val", (v) => v.toFixed(2), (v) => {
    state.ambient = v;
    apply();
  });

  apply();
}
