import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Constants } from "@babylonjs/core/Engines/constants";
import { GetTextureDataAsync } from "@babylonjs/core/Misc/textureTools";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { FurMaterial } from "@babylonjs/materials/fur";

import { syncShellMaterials } from "./configureFur";

const FUR_NOISE_SIZE = 256;

function maskLuminance(data: Uint8Array, i: number, fromRgb: boolean): number {
  const o = i * 4;
  if (fromRgb) {
    return Math.max(data[o], data[o + 1], data[o + 2]) / 255;
  }
  return data[o + 3] / 255;
}

function maskSampleMode(mask: BaseTexture): boolean {
  if (mask instanceof Texture) {
    return mask.getAlphaFromRGB || !mask.hasAlpha;
  }
  return true;
}

/** Per-vertex fur length scale when a grayscale mask is bound (heightTexture). */
export function computeMaskFurLength(shellLift: number, strength = 1): number {
  const t = Math.max(0, Math.min(1, strength));
  return Math.min(2, Math.max(0, shellLift * 20 * t));
}

/**
 * Multiply procedural fur noise by mask luminance (0 = no fur, 1 = full).
 * A channel = strands; G channel = shell layer visibility in Babylon fur shader.
 */
export async function bakeMaskedFurNoise(
  scene: Scene,
  mask: BaseTexture,
  baseNoise?: DynamicTexture,
): Promise<BaseTexture> {
  const noise = baseNoise ?? FurMaterial.GenerateTexture("furTexture", scene);
  const noiseData = await GetTextureDataAsync(noise, FUR_NOISE_SIZE, FUR_NOISE_SIZE);
  const maskData = await GetTextureDataAsync(mask, FUR_NOISE_SIZE, FUR_NOISE_SIZE);
  const fromRgb = maskSampleMode(mask);

  const pixels = new Uint8Array(FUR_NOISE_SIZE * FUR_NOISE_SIZE * 4);
  for (let i = 0; i < FUR_NOISE_SIZE * FUR_NOISE_SIZE; i++) {
    const o = i * 4;
    const m = maskLuminance(maskData, i, fromRgb);
    pixels[o] = noiseData[o];
    pixels[o + 1] = Math.round(noiseData[o + 1] * m);
    pixels[o + 2] = noiseData[o + 2];
    pixels[o + 3] = Math.round(noiseData[o + 3] * m);
  }

  const out = new RawTexture(
    pixels,
    FUR_NOISE_SIZE,
    FUR_NOISE_SIZE,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  out.name = "furTextureMasked";
  out.wrapU = Texture.WRAP_ADDRESSMODE;
  out.wrapV = Texture.WRAP_ADDRESSMODE;
  return out;
}

export interface ApplyFurDensityMaskOptions {
  shellLift: number;
  /** 0–1 multiplier for mask-driven strand length (height map). */
  maskStrength?: number;
  /** Re-bake fur noise from mask; set false when clearing mask only. */
  rebakeNoise?: boolean;
}

/** Apply or clear grayscale fur mask (Babylon heightTexture + furLength + masked fur noise). */
export async function applyFurDensityMask(
  scene: Scene,
  hull: FurMaterial,
  shells: Mesh[],
  mask: BaseTexture | null,
  options: ApplyFurDensityMaskOptions,
): Promise<void> {
  const strength = options.maskStrength ?? 1;
  const rebakeNoise = options.rebakeNoise ?? true;

  if (mask) {
    hull.heightTexture = mask as FurMaterial["heightTexture"];
    hull.furLength = computeMaskFurLength(options.shellLift, strength);
    if (rebakeNoise) {
      const base = FurMaterial.GenerateTexture("furTextureBase", scene);
      hull.furTexture = (await bakeMaskedFurNoise(scene, mask, base)) as FurMaterial["furTexture"];
    }
  } else {
    hull.furLength = 0;
    if (rebakeNoise) {
      hull.furTexture = FurMaterial.GenerateTexture("furTexture", scene);
    }
  }

  syncShellMaterials(shells, hull);
  hull.updateFur();
  scene.resetCachedMaterial();
}
