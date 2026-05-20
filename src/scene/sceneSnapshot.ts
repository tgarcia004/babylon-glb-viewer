import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import type { FurSettings } from "../fur/configureFur";
import type { StudioLightingState } from "../lighting/studioLights";
import type { PbrMaterialProfileId } from "../material/normalizeImportedMaterials";
import type { ViewerTheme } from "../ui/theme";

export const SCENE_SNAPSHOT_VERSION = 1 as const;
export const SCENE_SNAPSHOT_APP = "glb-studio";

export interface FurSettingsSnapshot {
  shellLift: number;
  stackDepth: number;
  furAngle: number;
  furDensity: number;
  furSpeed: number;
  furGravity: { x: number; y: number; z: number };
  quality: number;
}

export interface SceneSnapshotV1 {
  version: typeof SCENE_SNAPSHOT_VERSION;
  exportedAt: string;
  app: typeof SCENE_SNAPSHOT_APP;
  model: { fileName: string } | null;
  theme: ViewerTheme;
  pbrProfileId: PbrMaterialProfileId;
  fur: {
    enabled: boolean;
    settings: FurSettingsSnapshot;
  };
  lighting: StudioLightingState;
  camera: {
    alpha: number;
    beta: number;
    radius: number;
    target: [number, number, number];
  };
}

export interface SceneSnapshotSource {
  modelFileName: string | null;
  theme: ViewerTheme;
  pbrProfileId: PbrMaterialProfileId;
  furEnabled: boolean;
  furSettings: FurSettings;
  lighting: StudioLightingState;
  camera: ArcRotateCamera;
}

export function furSettingsToSnapshot(settings: FurSettings): FurSettingsSnapshot {
  return {
    shellLift: settings.shellLift,
    stackDepth: settings.stackDepth,
    furAngle: settings.furAngle,
    furDensity: settings.furDensity,
    furSpeed: settings.furSpeed,
    furGravity: {
      x: settings.furGravity.x,
      y: settings.furGravity.y,
      z: settings.furGravity.z,
    },
    quality: settings.quality,
  };
}

export function furSettingsFromSnapshot(snapshot: FurSettingsSnapshot): FurSettings {
  return {
    shellLift: snapshot.shellLift,
    stackDepth: snapshot.stackDepth,
    furAngle: snapshot.furAngle,
    furDensity: snapshot.furDensity,
    furSpeed: snapshot.furSpeed,
    furGravity: new Vector3(snapshot.furGravity.x, snapshot.furGravity.y, snapshot.furGravity.z),
    quality: snapshot.quality,
  };
}

export function buildSceneSnapshot(source: SceneSnapshotSource): SceneSnapshotV1 {
  const target = source.camera.target;
  return {
    version: SCENE_SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    app: SCENE_SNAPSHOT_APP,
    model: source.modelFileName ? { fileName: source.modelFileName } : null,
    theme: source.theme,
    pbrProfileId: source.pbrProfileId,
    fur: {
      enabled: source.furEnabled,
      settings: furSettingsToSnapshot(source.furSettings),
    },
    lighting: structuredClone(source.lighting),
    camera: {
      alpha: source.camera.alpha,
      beta: source.camera.beta,
      radius: source.camera.radius,
      target: [target.x, target.y, target.z],
    },
  };
}

export function parseSceneSnapshot(raw: unknown): SceneSnapshotV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid scene file: expected a JSON object.");
  }
  const data = raw as Record<string, unknown>;

  if (data.app !== SCENE_SNAPSHOT_APP) {
    throw new Error("This file is not a GLB Studio scene preset.");
  }
  if (data.version !== SCENE_SNAPSHOT_VERSION) {
    throw new Error(`Unsupported scene version (${String(data.version)}). Expected ${SCENE_SNAPSHOT_VERSION}.`);
  }

  const pbrProfileId = data.pbrProfileId;
  if (pbrProfileId !== "furShell" && pbrProfileId !== "albedoAlpha") {
    throw new Error("Invalid PBR profile in scene file.");
  }

  const theme = data.theme;
  if (theme !== "studio" && theme !== "display") {
    throw new Error("Invalid theme in scene file.");
  }

  const fur = data.fur;
  if (!fur || typeof fur !== "object") {
    throw new Error("Missing fur settings in scene file.");
  }
  const furObj = fur as Record<string, unknown>;
  if (typeof furObj.enabled !== "boolean") {
    throw new Error("Invalid fur.enabled in scene file.");
  }
  const settings = furObj.settings;
  if (!settings || typeof settings !== "object") {
    throw new Error("Missing fur.settings in scene file.");
  }
  const s = settings as Record<string, unknown>;
  const gravity = s.furGravity;
  if (!gravity || typeof gravity !== "object") {
    throw new Error("Missing fur.settings.furGravity in scene file.");
  }
  const g = gravity as Record<string, unknown>;

  const lighting = data.lighting;
  if (!lighting || typeof lighting !== "object") {
    throw new Error("Missing lighting in scene file.");
  }

  const camera = data.camera;
  if (!camera || typeof camera !== "object") {
    throw new Error("Missing camera in scene file.");
  }
  const cam = camera as Record<string, unknown>;
  const target = cam.target;
  if (!Array.isArray(target) || target.length !== 3) {
    throw new Error("Invalid camera.target in scene file.");
  }

  let model: SceneSnapshotV1["model"] = null;
  if (data.model != null) {
    if (typeof data.model !== "object") {
      throw new Error("Invalid model in scene file.");
    }
    const m = data.model as Record<string, unknown>;
    if (typeof m.fileName !== "string" || !m.fileName.trim()) {
      throw new Error("Invalid model.fileName in scene file.");
    }
    model = { fileName: m.fileName.trim() };
  }

  const num = (v: unknown, label: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`Invalid ${label} in scene file.`);
    }
    return v;
  };

  const lightRole = (role: unknown, name: string) => {
    if (!role || typeof role !== "object") {
      throw new Error(`Missing lighting.${name} in scene file.`);
    }
    const r = role as Record<string, unknown>;
    return {
      enabled: Boolean(r.enabled),
      azimuth: num(r.azimuth, `lighting.${name}.azimuth`),
      elevation: num(r.elevation, `lighting.${name}.elevation`),
      intensity: num(r.intensity, `lighting.${name}.intensity`),
      color: typeof r.color === "string" ? r.color : "#ffffff",
    };
  };

  const lit = lighting as Record<string, unknown>;

  return {
    version: SCENE_SNAPSHOT_VERSION,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date(0).toISOString(),
    app: SCENE_SNAPSHOT_APP,
    model,
    theme,
    pbrProfileId,
    fur: {
      enabled: furObj.enabled,
      settings: {
        shellLift: num(s.shellLift, "fur.settings.shellLift"),
        stackDepth: num(s.stackDepth, "fur.settings.stackDepth"),
        furAngle: num(s.furAngle, "fur.settings.furAngle"),
        furDensity: num(s.furDensity, "fur.settings.furDensity"),
        furSpeed: num(s.furSpeed, "fur.settings.furSpeed"),
        furGravity: {
          x: num(g.x, "fur.settings.furGravity.x"),
          y: num(g.y, "fur.settings.furGravity.y"),
          z: num(g.z, "fur.settings.furGravity.z"),
        },
        quality: num(s.quality, "fur.settings.quality"),
      },
    },
    lighting: {
      key: lightRole(lit.key, "key"),
      fill: lightRole(lit.fill, "fill"),
      rim: lightRole(lit.rim, "rim"),
      ambient: num(lit.ambient, "lighting.ambient"),
    },
    camera: {
      alpha: num(cam.alpha, "camera.alpha"),
      beta: num(cam.beta, "camera.beta"),
      radius: num(cam.radius, "camera.radius"),
      target: [num(target[0], "camera.target[0]"), num(target[1], "camera.target[1]"), num(target[2], "camera.target[2]")],
    },
  };
}

export function snapshotDownloadName(modelFileName: string | null): string {
  const base = modelFileName?.replace(/\.[^.]+$/, "") ?? "scene";
  const safe = base.replace(/[^\w.-]+/g, "_").slice(0, 48);
  const stamp = new Date().toISOString().slice(0, 10);
  return `${safe}-glb-studio-${stamp}.json`;
}

export interface SaveSceneSnapshotResult {
  saved: boolean;
  fileName: string;
  /** True when the native Save As dialog was used (Chrome / Edge). */
  usedSavePicker: boolean;
}

function snapshotJsonText(snapshot: SceneSnapshotV1): string {
  return JSON.stringify(snapshot, null, 2);
}

/** Fallback when showSaveFilePicker is unavailable (e.g. Firefox). */
function downloadSceneSnapshotFallback(contents: string, fileName: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Opens the system Save As dialog when supported so you can pick folder and filename.
 * Falls back to a direct browser download otherwise.
 */
export async function saveSceneSnapshot(
  snapshot: SceneSnapshotV1,
  fileName?: string,
): Promise<SaveSceneSnapshotResult> {
  const name = fileName ?? snapshotDownloadName(snapshot.model?.fileName ?? null);
  const contents = snapshotJsonText(snapshot);

  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "GLB Studio scene preset",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(contents);
      await writable.close();
      return { saved: true, fileName: handle.name, usedSavePicker: true };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return { saved: false, fileName: name, usedSavePicker: true };
      }
      throw err;
    }
  }

  downloadSceneSnapshotFallback(contents, name);
  return { saved: true, fileName: name, usedSavePicker: false };
}

export async function readSceneSnapshotFile(file: File): Promise<SceneSnapshotV1> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Could not parse JSON.");
  }
  return parseSceneSnapshot(parsed);
}
