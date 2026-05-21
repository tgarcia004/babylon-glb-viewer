import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { FurMaterial } from "@babylonjs/materials/fur";

import {
  applyUniversalMaterialUv,
  readUniversalMaterialUv,
  type TextureUvState,
} from "../material/materialUv";
import type { FurInspectorDefaults } from "./furInspectorDefaults";
import { clampFurSpeed, syncShellMaterials } from "./configureFur";

export type { TextureUvState } from "../material/materialUv";

export interface FurEditorSnapshot {
  diffuseColor: Color3;
  furAngle: number;
  furDensity: number;
  furSpeed: number;
  furGravity: Vector3;
  alpha: number;
  transparencyMode: number;
  furLength: number;
  furTime: number;
  diffuseTexture: BaseTexture | null;
  heightTexture: BaseTexture | null;
  furTexture: BaseTexture | null;
  uv: TextureUvState;
}

/** Snapshot used to re-apply inspector “Default” baseline after a shell-quality rebuild. */
export function furEditorSnapshotFromInspectorDefaults(defaults: FurInspectorDefaults): FurEditorSnapshot {
  return {
    diffuseColor: defaults.diffuseColor.clone(),
    furAngle: defaults.furAngle,
    furDensity: defaults.furDensity,
    furSpeed: clampFurSpeed(defaults.furSpeed),
    furGravity: defaults.furGravity.clone(),
    alpha: defaults.alpha,
    transparencyMode: defaults.transparencyMode,
    furLength: 0,
    furTime: 0,
    diffuseTexture: defaults.diffuseTexture,
    heightTexture: defaults.heightTexture,
    furTexture: defaults.furTexture,
    uv: { ...defaults.uv },
  };
}

export function captureFurEditorSnapshot(hull: FurMaterial): FurEditorSnapshot {
  return {
    diffuseColor: hull.diffuseColor.clone(),
    furAngle: hull.furAngle,
    furDensity: hull.furDensity,
    furSpeed: clampFurSpeed(hull.furSpeed),
    furGravity: hull.furGravity.clone(),
    alpha: hull.alpha,
    transparencyMode: hull.transparencyMode ?? 0,
    furLength: hull.furLength,
    furTime: hull.furTime,
    diffuseTexture: hull.diffuseTexture,
    heightTexture: hull.heightTexture,
    furTexture: hull.furTexture,
    uv: readUniversalMaterialUv(hull),
  };
}

export function restoreFurEditorSnapshot(
  hull: FurMaterial,
  shells: Mesh[],
  snapshot: FurEditorSnapshot,
): void {
  hull.diffuseColor = snapshot.diffuseColor.clone();
  hull.furAngle = snapshot.furAngle;
  hull.furDensity = snapshot.furDensity;
  hull.furSpeed = clampFurSpeed(snapshot.furSpeed);
  hull.furGravity = snapshot.furGravity.clone();
  hull.alpha = snapshot.alpha;
  hull.transparencyMode = snapshot.transparencyMode;
  hull.furLength = snapshot.furLength;
  hull.furTime = snapshot.furTime;

  hull.diffuseTexture = snapshot.diffuseTexture as FurMaterial["diffuseTexture"];
  hull.heightTexture = snapshot.heightTexture as FurMaterial["heightTexture"];
  hull.furTexture = snapshot.furTexture as FurMaterial["furTexture"];

  applyUniversalMaterialUv(hull, snapshot.uv);

  syncShellMaterials(shells, hull);
  hull.getScene()?.resetCachedMaterial();
  hull.updateFur();
}
