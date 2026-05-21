import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

import {
  applyStudioLighting,
  type StudioLightRig,
  type StudioLightingState,
} from "../lighting/studioLights";
import {
  buildSceneSnapshot,
  readSceneSnapshotFile,
  saveSceneSnapshot,
  snapshotDownloadName,
  type SceneSnapshotSource,
  type SceneSnapshotV1,
} from "../scene/sceneSnapshot";
import { applyViewerTheme } from "./theme";

function isScenePresetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".json") || file.type === "application/json";
}

function preventFileDragDefaults(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

export function setRange(panel: HTMLElement, inputId: string, valId: string, value: number, format: (v: number) => string): void {
  const input = panel.querySelector<HTMLInputElement>(`#${inputId}`);
  const valEl = panel.querySelector<HTMLElement>(`#${valId}`);
  if (!input) return;
  input.value = String(value);
  if (valEl) valEl.textContent = format(value);
}

function setCheckbox(panel: HTMLElement, id: string, checked: boolean): void {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (el) el.checked = checked;
}

function setColor(panel: HTMLElement, id: string, hex: string): void {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (el) el.value = hex;
}

function syncLightRole(
  panel: HTMLElement,
  role: "key" | "fill" | "rim",
  params: StudioLightingState["key"],
): void {
  setCheckbox(panel, `light-${role}-enabled`, params.enabled);
  setRange(panel, `light-${role}-az`, `light-${role}-az-val`, params.azimuth, (v) => `${Math.round(v)}°`);
  setRange(panel, `light-${role}-el`, `light-${role}-el-val`, params.elevation, (v) => `${Math.round(v)}°`);
  setRange(panel, `light-${role}-int`, `light-${role}-int-val`, params.intensity, (v) => v.toFixed(2));
  setColor(panel, `light-${role}-color`, params.color);
}

export function syncPanelFromSnapshot(panel: HTMLElement, snapshot: SceneSnapshotV1): void {
  setCheckbox(panel, "fur-enabled", snapshot.fur.enabled);
  const fs = snapshot.fur.settings;
  setRange(panel, "fur-quality", "fur-quality-val", fs.quality, (v) => String(Math.round(v)));
  setRange(panel, "fur-length", "fur-length-val", fs.shellLift, (v) => v.toFixed(3));
  setRange(panel, "fur-angle", "fur-angle-val", fs.furAngle, (v) => v.toFixed(2));
  setRange(panel, "fur-spacing", "fur-spacing-val", fs.stackDepth, (v) => v.toFixed(2));
  setRange(panel, "fur-density", "fur-density-val", fs.furDensity, (v) => String(Math.round(v)));
  setRange(panel, "fur-speed", "fur-speed-val", fs.furSpeed, (v) => String(Math.round(v)));
  setRange(panel, "fur-gravity-y", "fur-gravity-y-val", fs.furGravity.y, (v) => v.toFixed(2));

  syncLightRole(panel, "key", snapshot.lighting.key);
  syncLightRole(panel, "fill", snapshot.lighting.fill);
  syncLightRole(panel, "rim", snapshot.lighting.rim);
  setRange(panel, "light-ambient", "light-ambient-val", snapshot.lighting.ambient, (v) => v.toFixed(2));
}

export interface SceneSnapshotController {
  getSource(): SceneSnapshotSource;
  applySnapshot(snapshot: SceneSnapshotV1): Promise<string[]>;
}

export function wireSceneSnapshotPanel(
  panel: HTMLElement,
  scene: Scene,
  lightRig: StudioLightRig,
  lighting: StudioLightingState,
  camera: ArcRotateCamera,
  controller: SceneSnapshotController,
): void {
  const exportBtn = panel.querySelector<HTMLButtonElement>("#scene-export-json");
  const importBtn = panel.querySelector<HTMLButtonElement>("#scene-import-json");
  const importInput = panel.querySelector<HTMLInputElement>("#scene-import-input");
  const statusEl = panel.querySelector<HTMLElement>("#scene-preset-status");

  const setStatus = (text: string) => {
    if (statusEl) statusEl.textContent = text;
  };

  const applyImportedFile = (file: File): void => {
    if (!isScenePresetFile(file)) {
      setStatus("Drop a .json scene preset file.");
      return;
    }

    void (async () => {
      try {
        const snapshot = await readSceneSnapshotFile(file);
        Object.assign(lighting, structuredClone(snapshot.lighting));
        syncPanelFromSnapshot(panel, snapshot);
        applyStudioLighting(lightRig, scene, lighting);
        applyViewerTheme(snapshot.theme);

        camera.alpha = snapshot.camera.alpha;
        camera.beta = snapshot.camera.beta;
        camera.radius = snapshot.camera.radius;
        camera.target = new Vector3(
          snapshot.camera.target[0],
          snapshot.camera.target[1],
          snapshot.camera.target[2],
        );
        camera.inertialAlphaOffset = 0;
        camera.inertialBetaOffset = 0;
        camera.inertialRadiusOffset = 0;
        camera.inertialPanningX = 0;
        camera.inertialPanningY = 0;

        const notes = await controller.applySnapshot(snapshot);
        const modelNote = snapshot.model
          ? `Model: ${snapshot.model.fileName}`
          : "No model reference in file";
        setStatus([modelNote, ...notes].filter(Boolean).join(" · "));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Import failed.";
        setStatus(msg);
      }
    })();
  };

  exportBtn?.addEventListener("click", () => {
    void (async () => {
      const source = controller.getSource();
      const snapshot = buildSceneSnapshot(source);
      try {
        const result = await saveSceneSnapshot(
          snapshot,
          snapshotDownloadName(source.modelFileName),
        );
        if (!result.saved) {
          setStatus("Export canceled.");
          return;
        }
        if (result.usedSavePicker) {
          setStatus(`Saved ${result.fileName}`);
        } else {
          setStatus(
            `Saved ${result.fileName} to your browser downloads folder. Use Chrome or Edge for a Save As dialog.`,
          );
        }
      } catch (err) {
        setStatus(err instanceof Error ? err.message : "Export failed.");
      }
    })();
  });

  importBtn?.addEventListener("click", () => {
    importInput?.click();
  });

  importInput?.addEventListener("change", () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (file) applyImportedFile(file);
  });

  if (importBtn) {
    importBtn.addEventListener("dragenter", (e) => {
      preventFileDragDefaults(e);
      importBtn.classList.add("is-dragover");
    });

    importBtn.addEventListener("dragover", (e) => {
      preventFileDragDefaults(e);
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      importBtn.classList.add("is-dragover");
    });

    importBtn.addEventListener("dragleave", (e) => {
      preventFileDragDefaults(e);
      const related = e.relatedTarget;
      if (!related || !importBtn.contains(related as Node)) {
        importBtn.classList.remove("is-dragover");
      }
    });

    const onImportDrop = (e: DragEvent): void => {
      preventFileDragDefaults(e);
      importBtn.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) applyImportedFile(file);
    };

    // Capture phase so this runs after window capture returns without stopping propagation.
    importBtn.addEventListener("drop", onImportDrop, true);
  }
}
