import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { FurMaterial } from "@babylonjs/materials/fur";

import { clampFurSpeed, syncShellMaterials } from "./configureFur";

export type FurInspectorSlotId = "diffuse" | "height" | "fur-noise";

/** Baseline fur material state captured when fur is built for a model. */
export interface FurInspectorDefaults {
  diffuseTexture: BaseTexture | null;
  heightTexture: BaseTexture | null;
  diffuseColor: Color3;
  furAngle: number;
  furDensity: number;
  furSpeed: number;
  furGravity: Vector3;
  alpha: number;
  transparencyMode: number;
}

export function canRestoreFurSlot(defaults: FurInspectorDefaults | null, slotId: FurInspectorSlotId): boolean {
  if (!defaults) return false;
  if (slotId === "diffuse") return !!defaults.diffuseTexture;
  if (slotId === "height") return !!defaults.heightTexture;
  return true;
}

export function restoreFurSlot(
  scene: Scene,
  hull: FurMaterial,
  shells: Mesh[],
  defaults: FurInspectorDefaults,
  slotId: FurInspectorSlotId,
): boolean {
  if (!canRestoreFurSlot(defaults, slotId)) return false;

  if (slotId === "diffuse" && defaults.diffuseTexture) {
    hull.diffuseTexture = defaults.diffuseTexture;
  } else if (slotId === "height" && defaults.heightTexture) {
    hull.heightTexture = defaults.heightTexture;
  } else if (slotId === "fur-noise") {
    hull.furTexture = FurMaterial.GenerateTexture("furTexture", scene);
  }

  syncShellMaterials(shells, hull);
  hull.updateFur();
  scene.resetCachedMaterial();
  return true;
}

export function restoreFurProperties(hull: FurMaterial, shells: Mesh[], defaults: FurInspectorDefaults): void {
  hull.diffuseColor = defaults.diffuseColor.clone();
  hull.furAngle = defaults.furAngle;
  hull.furDensity = defaults.furDensity;
  hull.furSpeed = clampFurSpeed(defaults.furSpeed);
  hull.furTime = 0;
  hull.furGravity = defaults.furGravity.clone();
  hull.alpha = defaults.alpha;
  hull.transparencyMode = defaults.transparencyMode;

  syncShellMaterials(shells, hull);
  hull.getScene()?.resetCachedMaterial();
  hull.updateFur();
}

export function snapshotFurInspectorDefaults(
  hull: FurMaterial,
  heightTexture: BaseTexture | null,
): FurInspectorDefaults {
  return {
    diffuseTexture: hull.diffuseTexture ?? null,
    heightTexture,
    diffuseColor: hull.diffuseColor.clone(),
    furAngle: hull.furAngle,
    furDensity: hull.furDensity,
    furSpeed: clampFurSpeed(hull.furSpeed),
    furGravity: hull.furGravity.clone(),
    alpha: hull.alpha,
    transparencyMode: hull.transparencyMode ?? 0,
  };
}
