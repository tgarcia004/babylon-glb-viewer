import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { FurMaterial } from "@babylonjs/materials/fur";

import { applyUniversalMaterialUv, readUniversalMaterialUv, type TextureUvState } from "../material/materialUv";
import { applyFurDensityMask } from "./furDensityMask";
import {
  clampFurSpeed,
  furSpeedForEngine,
  normalizeStoredFurSpeed,
  syncShellMaterials,
} from "./configureFur";

export type FurInspectorSlotId = "diffuse" | "fur-mask" | "fur-noise";

/** Baseline fur material state captured when fur is built for a model. */
export interface FurInspectorDefaults {
  diffuseTexture: BaseTexture | null;
  heightTexture: BaseTexture | null;
  furTexture: BaseTexture | null;
  diffuseColor: Color3;
  furAngle: number;
  furDensity: number;
  furSpeed: number;
  furGravity: Vector3;
  alpha: number;
  transparencyMode: number;
  shellLift: number;
  stackDepth: number;
  quality: number;
  uv: TextureUvState;
}

export function canRestoreFurSlot(defaults: FurInspectorDefaults | null, slotId: FurInspectorSlotId): boolean {
  if (!defaults) return false;
  if (slotId === "diffuse") return !!defaults.diffuseTexture;
  if (slotId === "fur-mask") return true;
  return true;
}

export async function restoreFurSlot(
  scene: Scene,
  hull: FurMaterial,
  shells: Mesh[],
  defaults: FurInspectorDefaults,
  slotId: FurInspectorSlotId,
  shellLift: number,
): Promise<boolean> {
  if (!canRestoreFurSlot(defaults, slotId)) return false;

  if (slotId === "diffuse" && defaults.diffuseTexture) {
    hull.diffuseTexture = defaults.diffuseTexture;
    syncShellMaterials(shells, hull);
    hull.updateFur();
    scene.resetCachedMaterial();
    return true;
  }

  if (slotId === "fur-mask") {
    await applyFurDensityMask(scene, hull, shells, defaults.heightTexture, {
      shellLift,
      maskStrength: 1,
    });
    return true;
  }

  if (slotId === "fur-noise") {
    if (defaults.furTexture) {
      hull.furTexture = defaults.furTexture as FurMaterial["furTexture"];
    } else {
      hull.furTexture = FurMaterial.GenerateTexture("furTexture", scene);
    }
    syncShellMaterials(shells, hull);
    hull.updateFur();
    scene.resetCachedMaterial();
    return true;
  }

  return false;
}

export function restoreFurProperties(hull: FurMaterial, shells: Mesh[], defaults: FurInspectorDefaults): void {
  hull.diffuseColor = defaults.diffuseColor.clone();
  hull.furAngle = defaults.furAngle;
  hull.furDensity = defaults.furDensity;
  hull.furSpeed = furSpeedForEngine(defaults.furSpeed);
  hull.furTime = 0;
  hull.furGravity = defaults.furGravity.clone();
  hull.alpha = defaults.alpha;
  hull.transparencyMode = defaults.transparencyMode;
  applyUniversalMaterialUv(hull, defaults.uv);

  syncShellMaterials(shells, hull);
  hull.getScene()?.resetCachedMaterial();
  hull.updateFur();
}

export function snapshotFurInspectorDefaults(
  hull: FurMaterial,
  heightTexture: BaseTexture | null,
  shellLift: number,
  stackDepth: number,
  quality: number,
): FurInspectorDefaults {
  return {
    diffuseTexture: hull.diffuseTexture ?? null,
    heightTexture,
    furTexture: hull.furTexture ?? null,
    diffuseColor: hull.diffuseColor.clone(),
    furAngle: hull.furAngle,
    furDensity: hull.furDensity,
    furSpeed: normalizeStoredFurSpeed(hull.furSpeed),
    furGravity: hull.furGravity.clone(),
    alpha: hull.alpha,
    transparencyMode: hull.transparencyMode ?? 0,
    shellLift,
    stackDepth,
    quality,
    uv: readUniversalMaterialUv(hull),
  };
}
