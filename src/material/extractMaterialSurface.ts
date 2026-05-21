import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { GetTextureDataAsync } from "@babylonjs/core/Misc/textureTools";
import type { Scene } from "@babylonjs/core/scene";

/** GPU readback + CPU merge is expensive — cap working size. */
const MAX_MERGE_TEXEL = 1024;

export interface MaterialSurface {
  diffuseTexture: BaseTexture | null;
  opacityTexture: BaseTexture | null;
  diffuseColor: Color3;
  alpha: number;
  transparencyMode: number;
  alphaCutOff: number;
  mergedDiffuse?: RawTexture;
}

function fromPbr(mat: PBRMaterial): MaterialSurface {
  return {
    diffuseTexture: mat.albedoTexture,
    opacityTexture: mat.opacityTexture,
    diffuseColor: mat.albedoColor.clone(),
    alpha: mat.alpha,
    transparencyMode: mat.transparencyMode ?? Material.MATERIAL_OPAQUE,
    alphaCutOff: mat.alphaCutOff,
  };
}

function fromStandard(mat: StandardMaterial): MaterialSurface {
  return {
    diffuseTexture: mat.diffuseTexture,
    opacityTexture: null,
    diffuseColor: mat.diffuseColor.clone(),
    alpha: mat.alpha,
    transparencyMode: mat.transparencyMode ?? Material.MATERIAL_OPAQUE,
    alphaCutOff: mat.alphaCutOff,
  };
}

export function extractMaterialSurfaceFromMesh(mat: Material | null): MaterialSurface | null {
  if (!mat) return null;
  if (mat instanceof PBRMaterial) return fromPbr(mat);
  if (mat instanceof StandardMaterial) return fromStandard(mat);
  if (mat instanceof MultiMaterial) {
    for (const sub of mat.subMaterials) {
      const s = extractMaterialSurfaceFromMesh(sub as Material | null);
      if (s) return s;
    }
  }
  return null;
}

export function surfaceCacheKey(surface: MaterialSurface | null): string {
  if (!surface) return "";
  const d = surface.diffuseTexture?.uniqueId ?? 0;
  const o = surface.opacityTexture?.uniqueId ?? 0;
  return `${d}:${o}:${surface.alpha}:${surface.transparencyMode}`;
}

/** Separate opacity map must be baked into diffuse alpha for FurMaterial. */
export function needsOpacityMerge(surface: MaterialSurface): boolean {
  return !!(surface.opacityTexture && surface.diffuseTexture instanceof Texture);
}

/** Albedo-alpha profile: cutout from base color texture A channel. */
export function surfaceUsesAlbedoAlpha(surface: MaterialSurface | null): boolean {
  if (!surface) return false;
  const tex = surface.diffuseTexture;
  return !!(tex && "hasAlpha" in tex && (tex as Texture).hasAlpha);
}

/** FurMaterial only reads diffuse alpha; merge or enable clip when glTF uses a mask. */
export function needsFurAlphaBake(surface: MaterialSurface | null): boolean {
  if (!surface) return false;
  if (needsOpacityMerge(surface)) return true;
  if (surface.transparencyMode === Material.MATERIAL_ALPHATEST) return true;
  const tex = surface.diffuseTexture;
  return !!(tex && "hasAlpha" in tex && tex.hasAlpha);
}

function mergeTargetSize(width: number, height: number): { w: number; h: number } {
  const maxDim = Math.max(width, height, 1);
  if (maxDim <= MAX_MERGE_TEXEL) {
    return { w: width, h: height };
  }
  const s = MAX_MERGE_TEXEL / maxDim;
  return {
    w: Math.max(1, Math.round(width * s)),
    h: Math.max(1, Math.round(height * s)),
  };
}

function opacitySample(data: Uint8Array, i: number, fromRgb: boolean): number {
  const o = i * 4;
  if (fromRgb) {
    return Math.max(data[o], data[o + 1], data[o + 2]);
  }
  return data[o + 3];
}

/** Merge a mask texture into the albedo alpha channel (for fur silhouette cutouts). */
export async function mergeOpacityIntoDiffuse(
  scene: Scene,
  albedo: BaseTexture,
  mask: BaseTexture,
  name: string,
  options?: { sampleRgb?: boolean },
): Promise<RawTexture> {
  const src = albedo.getSize();
  const { w, h } = mergeTargetSize(src.width, src.height);
  const albData = await GetTextureDataAsync(albedo, w, h);
  const maskData = await GetTextureDataAsync(mask, w, h);
  let fromRgb = true;
  if (options?.sampleRgb !== undefined) {
    fromRgb = options.sampleRgb;
  } else if (mask instanceof Texture) {
    fromRgb = mask.getAlphaFromRGB || !mask.hasAlpha;
  }

  const pixels = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    pixels[o] = albData[o];
    pixels[o + 1] = albData[o + 1];
    pixels[o + 2] = albData[o + 2];
    let alpha = albData[o + 3];
    const maskValue = opacitySample(maskData, i, fromRgb);
    alpha = Math.round((maskValue / 255) * (alpha / 255) * 255);
    pixels[o + 3] = alpha;
  }

  const merged = new RawTexture(
    pixels,
    w,
    h,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  merged.name = name;
  merged.hasAlpha = true;
  return merged;
}

/**
 * Merge opacity into albedo alpha for fur. Runs at most once per material (caller caches).
 */
async function bakeAlbedoPixels(
  scene: Scene,
  name: string,
  albedo: BaseTexture,
  surface: MaterialSurface,
  opacityTex: BaseTexture | null,
): Promise<RawTexture> {
  if (!opacityTex) {
    throw new Error("bakeAlbedoPixels requires an opacity texture");
  }
  const merged = await mergeOpacityIntoDiffuse(scene, albedo, opacityTex, name, {
    sampleRgb: opacityTex instanceof Texture && opacityTex.getAlphaFromRGB,
  });
  surface.mergedDiffuse = merged;
  return merged;
}

export async function buildFurDiffuseTexture(
  scene: Scene,
  surface: MaterialSurface,
  name: string,
): Promise<BaseTexture | null> {
  const albedo = surface.diffuseTexture;
  if (!albedo) return null;

  if (needsOpacityMerge(surface)) {
    return bakeAlbedoPixels(scene, name, albedo, surface, surface.opacityTexture);
  }

  return albedo;
}

export function describeMaterialSurface(surface: MaterialSurface | null): string {
  if (!surface) return "No material";
  const parts: string[] = [];
  if (surface.diffuseTexture) parts.push("base color map");
  if (surface.opacityTexture) parts.push("opacity map");
  if (surface.transparencyMode === Material.MATERIAL_ALPHATEST) parts.push("alpha clip");
  else if (surface.transparencyMode === Material.MATERIAL_ALPHABLEND) parts.push("alpha blend");
  if (surface.alpha < 0.999) parts.push(`α=${surface.alpha.toFixed(2)}`);
  return parts.length ? parts.join(" · ") : "solid PBR";
}
