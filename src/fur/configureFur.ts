/**
 * Official Babylon fur technique (FurMaterial + FurifyMesh).
 * Shell distance from the hull uses furSpacing (vertex shader: normal * furOffset * furSpacing).
 */

import { FurMaterial } from "@babylonjs/materials/fur";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { MaterialSurface } from "../material/extractMaterialSurface";

export const FUR_DEFAULTS = {
  /** UI "Fur length" — how far shell layers sit above the hull (mesh-scaled). */
  shellLift: 0.05,
  /** UI "Stack depth" — thickness of the shell stack outward. */
  stackDepth: 0.35,
  furAngle: 0,
  furColor: new Color3(2, 2, 2),
  furDensity: 20,
  furSpeed: 300,
  furGravity: new Vector3(0, -1, 0),
  quality: 12,
} as const;

/** Keep shell count reasonable for dense imported meshes. */
export function capFurQuality(mesh: Mesh, requested: number): number {
  const q = Math.max(2, Math.round(requested));
  const tris = Math.floor((mesh.getIndices()?.length ?? 0) / 3);
  if (tris > 250_000) return Math.min(q, 6);
  if (tris > 120_000) return Math.min(q, 8);
  if (tris > 50_000) return Math.min(q, 12);
  if (tris > 20_000) return Math.min(q, 16);
  return q;
}

export interface FurSettings {
  shellLift: number;
  stackDepth: number;
  furAngle: number;
  furDensity: number;
  furSpeed: number;
  furGravity: Vector3;
  quality: number;
}

export interface FurInstance {
  shells: Mesh[];
  material: FurMaterial;
  triangleCount: number;
  update(settings: Partial<FurSettings>): void;
  dispose(): void;
}

/** Largest half-extent of the mesh in world space (for scaling shell offsets). */
export function meshShellScale(mesh: Mesh): number {
  mesh.computeWorldMatrix(true);
  const e = mesh.getBoundingInfo().boundingBox.extendSizeWorld;
  return Math.max(e.x, e.y, e.z, 1e-4);
}

/**
 * furSpacing drives shell offset: first shell ≈ furSpacing/quality, outer ≈ furSpacing.
 * shellLift sets how far the first shell sits above the hull; stackDepth adds outward volume.
 */
export function computeFurSpacing(
  mesh: Mesh,
  shellLift: number,
  stackDepth: number,
  quality: number,
): number {
  const scale = meshShellScale(mesh);
  const q = Math.max(2, quality);
  const epsilon = scale * 4e-5;
  const firstShellGap = shellLift * scale * 0.012 + epsilon;
  const stackExtra = stackDepth * scale * 0.045;
  return q * firstShellGap + stackExtra;
}

function applySurfaceToFur(fur: FurMaterial, surface: MaterialSurface | null): void {
  if (!surface) return;
  fur.diffuseColor = surface.diffuseColor.clone();
  fur.alpha = 1;
  fur.transparencyMode = Material.MATERIAL_OPAQUE;
}

function applyFurAlphaMask(
  fur: FurMaterial,
  surface: MaterialSurface | null,
  diffuse: BaseTexture | null,
  useAlphaMask: boolean,
): void {
  if (!useAlphaMask || !diffuse || !(diffuse instanceof Texture)) return;

  diffuse.hasAlpha = true;

  if (surface?.transparencyMode === Material.MATERIAL_ALPHABLEND) {
    fur.transparencyMode = Material.MATERIAL_ALPHABLEND;
    fur.alpha = Math.min(1, Math.max(0, surface.alpha));
    fur.separateCullingPass = true;
    return;
  }

  fur.transparencyMode = Material.MATERIAL_ALPHATEST;
}

function syncShellMaterials(shells: Mesh[], fur: FurMaterial): void {
  for (let i = 0; i < shells.length; i++) {
    const mat = shells[i].material as FurMaterial | null;
    if (!mat) continue;
    mat.backFaceCulling = false;
    mat.alpha = fur.alpha;
    mat.transparencyMode = fur.transparencyMode;
    mat.diffuseColor = fur.diffuseColor.clone();
  }
}

export function applyFur(
  mesh: Mesh,
  diffuseTexture: BaseTexture | null,
  settings: FurSettings,
  surface: MaterialSurface | null = null,
  /** Use alpha clip only when a baked mask was merged into the diffuse texture. */
  useBakedAlphaMask = false,
): FurInstance {
  const originalMaterial: Material | null = mesh.material;

  const fur = new FurMaterial("fur", mesh.getScene());
  fur.furLength = 0;
  fur.furAngle = settings.furAngle;
  fur.furColor = FUR_DEFAULTS.furColor.clone();
  applySurfaceToFur(fur, surface);
  if (diffuseTexture) {
    const tex = diffuseTexture as Texture;
    fur.diffuseTexture = tex;
    applyFurAlphaMask(fur, surface, tex, useBakedAlphaMask);
  }
  fur.furTexture = FurMaterial.GenerateTexture("furTexture", mesh.getScene());
  const quality = capFurQuality(mesh, settings.quality);
  fur.furSpacing = computeFurSpacing(mesh, settings.shellLift, settings.stackDepth, quality);
  fur.furDensity = settings.furDensity;
  fur.furSpeed = settings.furSpeed;
  fur.furGravity = settings.furGravity.clone();

  mesh.material = fur;

  const shells = FurMaterial.FurifyMesh(mesh, quality);
  syncShellMaterials(shells, fur);

  const baseTri = Math.floor((mesh.getIndices()?.length ?? 0) / 3);
  const triangleCount = baseTri * shells.length;

  let current = { ...settings };
  const syncShells = (s: Partial<FurSettings>): void => {
    current = { ...current, ...s };
    fur.furAngle = current.furAngle;
    fur.furSpacing = computeFurSpacing(
      mesh,
      current.shellLift,
      current.stackDepth,
      capFurQuality(mesh, current.quality),
    );
    fur.furDensity = current.furDensity;
    fur.furSpeed = current.furSpeed;
    fur.furGravity = current.furGravity.clone();
    fur.updateFur();
  };

  return {
    shells,
    material: fur,
    triangleCount,
    update: syncShells,
    dispose() {
      mesh.material = originalMaterial;
      const noiseTexture = fur.furTexture;

      for (let i = 1; i < shells.length; i++) {
        const shellMat = shells[i].material as FurMaterial | null;
        if (!shellMat) continue;
        shellMat.diffuseTexture = null as unknown as Texture;
        shellMat.furTexture = null as unknown as ReturnType<typeof FurMaterial.GenerateTexture>;
      }
      fur.diffuseTexture = null as unknown as Texture;
      fur.furTexture = null as unknown as ReturnType<typeof FurMaterial.GenerateTexture>;
      (fur as unknown as { _meshes: unknown })._meshes = [];

      for (let i = 1; i < shells.length; i++) {
        const sh = shells[i];
        sh.material?.dispose(false, false);
        sh.dispose(false, false);
      }
      fur.dispose(false);
      noiseTexture?.dispose();
    },
  };
}
