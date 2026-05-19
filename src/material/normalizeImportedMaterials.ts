import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

export interface NormalizeImportedOptions {
  /** Many thin shell meshes (Blender fur-card export). */
  shellStack?: boolean;
}

function normalizePbrMaterial(mat: PBRMaterial, seen: Set<PBRMaterial>): void {
  if (seen.has(mat)) return;
  seen.add(mat);

  const albedo = mat.albedoTexture as Texture | null;
  const opacity = mat.opacityTexture as Texture | null;

  if (opacity) {
    opacity.getAlphaFromRGB = true;
    opacity.hasAlpha = true;
  }

  const isCutout = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHATEST;
  const isBlend = mat.transparencyMode === PBRMaterial.PBRMATERIAL_ALPHABLEND;

  if ((isCutout || isBlend) && albedo?.hasAlpha) {
    mat.useAlphaFromAlbedoTexture = true;
  }

  if (isCutout) {
    mat.useRadianceOverAlpha = false;
    mat.useSpecularOverAlpha = false;
  }

  if (isBlend) {
    mat.separateCullingPass = true;
  }
}

function walkMaterial(mat: Material | null, seen: Set<PBRMaterial>): void {
  if (!mat) return;
  if (mat instanceof MultiMaterial) {
    for (const sub of mat.subMaterials) {
      walkMaterial(sub as Material | null, seen);
    }
    return;
  }
  if (mat instanceof PBRMaterial) {
    normalizePbrMaterial(mat, seen);
  }
}

/** Stable draw order for stacked shells; light PBR alpha tweaks only when not a shell stack. */
export function normalizeImportedGltfMaterials(
  meshes: AbstractMesh[],
  options: NormalizeImportedOptions = {},
): void {
  const shellStack = options.shellStack ?? false;
  const seen = new Set<PBRMaterial>();

  const renderMeshes = meshes
    .filter((m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0)
    .sort((a, b) => a.uniqueId - b.uniqueId);

  let alphaIndex = 0;
  for (const mesh of renderMeshes) {
    mesh.alphaIndex = alphaIndex;
    if (!shellStack) {
      walkMaterial(mesh.material, seen);
    }
    alphaIndex += 1;
  }
}
