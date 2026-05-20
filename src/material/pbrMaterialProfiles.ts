import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

/** Named PBR handling presets the user can flip through in the inspector. */
export type PbrMaterialProfileId = "furShell" | "albedoAlpha";

export interface PbrMaterialProfile {
  id: PbrMaterialProfileId;
  /** Shown in UI and applied as Babylon material.name */
  label: string;
  description: string;
}

export const PBR_MATERIAL_PROFILES: readonly PbrMaterialProfile[] = [
  {
    id: "furShell",
    label: "Fur Shell PBR Mat",
    description:
      "Separate opacity map (RGB-packed). Base-color alpha only when the glTF already declares MASK or BLEND. Default for fur-card / shell exports.",
  },
  {
    id: "albedoAlpha",
    label: "AA Packed PBR Mat",
    description:
      "Alpha packed into Albedo texture / alpha channel (AA packed). Use for woven materials and other albedo-packed masks.",
  },
] as const;

const DEFAULT_ALPHA_CUTOFF = 0.5;

interface TransparencyBaseline {
  transparencyMode: number;
  alphaCutOff: number;
  alpha: number;
  useAlphaFromAlbedoTexture: boolean;
  backFaceCulling: boolean;
  twoSidedLighting: boolean;
  separateCullingPass: boolean;
  needDepthPrePass: boolean;
  useRadianceOverAlpha: boolean;
  useSpecularOverAlpha: boolean;
}

const transparencyBaselines = new WeakMap<PBRMaterial, TransparencyBaseline>();

function asTexture(tex: unknown): Texture | null {
  return tex instanceof Texture ? tex : null;
}

function captureBaseline(mat: PBRMaterial): void {
  if (transparencyBaselines.has(mat)) return;
  transparencyBaselines.set(mat, {
    transparencyMode: mat.transparencyMode ?? PBRMaterial.PBRMATERIAL_OPAQUE,
    alphaCutOff: mat.alphaCutOff,
    alpha: mat.alpha,
    useAlphaFromAlbedoTexture: mat.useAlphaFromAlbedoTexture,
    backFaceCulling: mat.backFaceCulling,
    twoSidedLighting: mat.twoSidedLighting,
    separateCullingPass: mat.separateCullingPass,
    needDepthPrePass: mat.needDepthPrePass,
    useRadianceOverAlpha: mat.useRadianceOverAlpha,
    useSpecularOverAlpha: mat.useSpecularOverAlpha,
  });
}

function restoreBaseline(mat: PBRMaterial): void {
  const baseline = transparencyBaselines.get(mat);
  if (!baseline) return;
  mat.transparencyMode = baseline.transparencyMode;
  mat.alphaCutOff = baseline.alphaCutOff;
  mat.alpha = baseline.alpha;
  mat.useAlphaFromAlbedoTexture = baseline.useAlphaFromAlbedoTexture;
  mat.backFaceCulling = baseline.backFaceCulling;
  mat.twoSidedLighting = baseline.twoSidedLighting;
  mat.separateCullingPass = baseline.separateCullingPass;
  mat.needDepthPrePass = baseline.needDepthPrePass;
  mat.useRadianceOverAlpha = baseline.useRadianceOverAlpha;
  mat.useSpecularOverAlpha = baseline.useSpecularOverAlpha;
}

function markMaskTexture(tex: Texture | null, rgbPacked = false): void {
  if (!tex) return;
  tex.hasAlpha = true;
  if (rgbPacked) {
    tex.getAlphaFromRGB = true;
  }
}

function inferMaskFromAlbedoAlpha(mat: PBRMaterial): void {
  const mode = mat.transparencyMode ?? PBRMaterial.PBRMATERIAL_OPAQUE;
  if (mode === PBRMaterial.PBRMATERIAL_ALPHATEST || mode === PBRMaterial.PBRMATERIAL_ALPHABLEND) {
    return;
  }
  mat.transparencyMode =
    mat.alpha < 0.999 ? PBRMaterial.PBRMATERIAL_ALPHABLEND : PBRMaterial.PBRMATERIAL_ALPHATEST;
  if (mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST && mat.alphaCutOff <= 0) {
    mat.alphaCutOff = DEFAULT_ALPHA_CUTOFF;
  }
}

/** Fur shell export: opacity map + glTF-declared albedo alpha only. */
function applyFurShellPbr(mat: PBRMaterial, label: string, index: number): void {
  captureBaseline(mat);
  restoreBaseline(mat);

  mat.name = index > 0 ? `${label} ${index}` : label;

  const albedo = asTexture(mat.albedoTexture);
  const opacity = asTexture(mat.opacityTexture);

  if (opacity) {
    opacity.getAlphaFromRGB = true;
    opacity.hasAlpha = true;
  }

  const isCutout = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST;
  const isBlend = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHABLEND;

  mat.useAlphaFromAlbedoTexture = !!(isCutout || isBlend) && !!albedo?.hasAlpha;

  if (isCutout) {
    mat.useRadianceOverAlpha = false;
    mat.useSpecularOverAlpha = false;
  }

  if (isBlend) {
    mat.separateCullingPass = true;
  }
}

/** Wicker / weave: sample cutout from albedo alpha channel. */
function applyAlbedoAlphaPbr(mat: PBRMaterial, label: string, index: number): void {
  captureBaseline(mat);
  restoreBaseline(mat);

  mat.name = index > 0 ? `${label} ${index}` : label;

  const albedo = asTexture(mat.albedoTexture);
  const opacity = asTexture(mat.opacityTexture);

  mat.useAlphaFromAlbedoTexture = false;

  if (opacity) {
    markMaskTexture(opacity, true);
  }

  if (albedo?.hasAlpha) {
    markMaskTexture(albedo);
    mat.useAlphaFromAlbedoTexture = true;
    inferMaskFromAlbedoAlpha(mat);
  } else if (opacity) {
    inferMaskFromAlbedoAlpha(mat);
  }

  const isCutout = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST;
  const isBlend = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHABLEND;
  const isMask = isCutout || isBlend;

  if (isCutout) {
    mat.useRadianceOverAlpha = false;
    mat.useSpecularOverAlpha = false;
    if (mat.alphaCutOff <= 0) {
      mat.alphaCutOff = DEFAULT_ALPHA_CUTOFF;
    }
  }

  if (isBlend) {
    mat.separateCullingPass = true;
    mat.needDepthPrePass = true;
  }

  if (isMask) {
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
  }
}

function applyProfileToPbr(
  mat: PBRMaterial,
  profile: PbrMaterialProfileId,
  label: string,
  index: number,
): void {
  if (profile === "albedoAlpha") {
    applyAlbedoAlphaPbr(mat, label, index);
  } else {
    applyFurShellPbr(mat, label, index);
  }
}

function walkMaterial(
  mat: Material | null,
  seen: Map<PBRMaterial, number>,
  profile: PbrMaterialProfileId,
  label: string,
): void {
  if (!mat) return;
  if (mat instanceof MultiMaterial) {
    for (const sub of mat.subMaterials) {
      walkMaterial(sub as Material | null, seen, profile, label);
    }
    return;
  }
  if (mat instanceof PBRMaterial) {
    let index = seen.get(mat) ?? 0;
    applyProfileToPbr(mat, profile, label, index);
    seen.set(mat, index + 1);
  }
}

export function getPbrMaterialProfile(id: PbrMaterialProfileId): PbrMaterialProfile {
  return PBR_MATERIAL_PROFILES.find((p) => p.id === id) ?? PBR_MATERIAL_PROFILES[0];
}

export function profileIndex(id: PbrMaterialProfileId): number {
  return PBR_MATERIAL_PROFILES.findIndex((p) => p.id === id);
}

export function cyclePbrProfile(
  current: PbrMaterialProfileId,
  direction: 1 | -1,
): PbrMaterialProfileId {
  const i = profileIndex(current);
  const next = (i + direction + PBR_MATERIAL_PROFILES.length) % PBR_MATERIAL_PROFILES.length;
  return PBR_MATERIAL_PROFILES[next].id;
}

export interface ApplyPbrProfileOptions {
  profile: PbrMaterialProfileId;
  /** Fur-card shell stacks skip fur-shell tweaks only (albedo alpha always runs). */
  shellStack?: boolean;
}

/** Apply a named PBR profile to every PBR material on the listed meshes. */
export function applyPbrMaterialProfile(
  meshes: AbstractMesh[],
  options: ApplyPbrProfileOptions,
): void {
  const profile = getPbrMaterialProfile(options.profile);
  const shellStack = options.shellStack ?? false;
  const skipForShellStack = options.profile === "furShell" && shellStack;
  const seen = new Map<PBRMaterial, number>();

  const renderMeshes = meshes
    .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0)
    .sort((a, b) => a.uniqueId - b.uniqueId);

  let alphaIndex = 0;
  for (const mesh of renderMeshes) {
    mesh.alphaIndex = alphaIndex;
    if (!skipForShellStack) {
      walkMaterial(mesh.material, seen, options.profile, profile.label);
    }
    alphaIndex += 1;
  }
}

/** Apply profile to a single PBR material (hull while fur has replaced mesh.material). */
export function applyPbrMaterialProfileToMaterial(
  mat: PBRMaterial,
  profileId: PbrMaterialProfileId,
  index = 0,
): void {
  const profile = getPbrMaterialProfile(profileId);
  applyProfileToPbr(mat, profileId, profile.label, index);
}
