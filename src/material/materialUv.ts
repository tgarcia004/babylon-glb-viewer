import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { FurMaterial } from "@babylonjs/materials/fur";

export interface TextureUvState {
  uOffset: number;
  vOffset: number;
  uScale: number;
  vScale: number;
  uAng: number;
  vAng: number;
  wAng: number;
  wrapU: number;
  wrapV: number;
  coordinatesIndex: number;
}

export const DEFAULT_TEXTURE_UV: TextureUvState = {
  uOffset: 0,
  vOffset: 0,
  uScale: 1,
  vScale: 1,
  uAng: 0,
  vAng: 0,
  wAng: 0,
  wrapU: Texture.WRAP_ADDRESSMODE,
  wrapV: Texture.WRAP_ADDRESSMODE,
  coordinatesIndex: 0,
};

/** All texture slots on a material (deduped). */
export function collectMaterialTextures(mat: Material): BaseTexture[] {
  const out: BaseTexture[] = [];
  const push = (tex: BaseTexture | null | undefined): void => {
    if (tex && !out.includes(tex)) {
      out.push(tex);
    }
  };

  if (mat instanceof FurMaterial) {
    push(mat.diffuseTexture);
    push(mat.heightTexture);
    push(mat.furTexture);
    return out;
  }

  if (mat instanceof PBRMaterial) {
    push(mat.albedoTexture);
    push(mat.metallicTexture);
    push(mat.bumpTexture);
    push(mat.emissiveTexture);
    push(mat.ambientTexture);
    push(mat.opacityTexture);
  }

  return out;
}

export function captureTextureUv(tex: BaseTexture | null): TextureUvState | null {
  if (!(tex instanceof Texture)) return null;
  return {
    uOffset: tex.uOffset,
    vOffset: tex.vOffset,
    uScale: tex.uScale,
    vScale: tex.vScale,
    uAng: tex.uAng,
    vAng: tex.vAng,
    wAng: tex.wAng,
    wrapU: tex.wrapU,
    wrapV: tex.wrapV,
    coordinatesIndex: tex.coordinatesIndex,
  };
}

export function applyTextureUv(tex: BaseTexture | null, uv: TextureUvState | null): void {
  if (!uv || !(tex instanceof Texture)) return;
  tex.uOffset = uv.uOffset;
  tex.vOffset = uv.vOffset;
  tex.uScale = uv.uScale;
  tex.vScale = uv.vScale;
  tex.uAng = uv.uAng;
  tex.vAng = uv.vAng;
  tex.wAng = uv.wAng;
  tex.wrapU = uv.wrapU;
  tex.wrapV = uv.wrapV;
  tex.coordinatesIndex = uv.coordinatesIndex;
}

/** Read UV transform from the first assigned texture, or defaults. */
export function readUniversalMaterialUv(mat: Material): TextureUvState {
  for (const tex of collectMaterialTextures(mat)) {
    const captured = captureTextureUv(tex);
    if (captured) return captured;
  }
  return { ...DEFAULT_TEXTURE_UV };
}

export function applyUniversalMaterialUv(mat: Material, uv: TextureUvState): void {
  for (const tex of collectMaterialTextures(mat)) {
    applyTextureUv(tex, uv);
  }
}
