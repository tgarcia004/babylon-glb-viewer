import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import {
  applyPbrMaterialProfile,
  type ApplyPbrProfileOptions,
  type PbrMaterialProfileId,
} from "./pbrMaterialProfiles";

export interface NormalizeImportedOptions {
  /** Many thin shell meshes (Blender fur-card export). */
  shellStack?: boolean;
  /** Named PBR material category (fur shell vs albedo alpha). */
  profile?: PbrMaterialProfileId;
}

/** @deprecated Use applyPbrMaterialProfile — kept for callers passing profile via normalize. */
export function normalizeImportedGltfMaterials(
  meshes: AbstractMesh[],
  options: NormalizeImportedOptions = {},
): void {
  applyPbrMaterialProfile(meshes, {
    profile: options.profile ?? "furShell",
    shellStack: options.shellStack,
  });
}

export type { PbrMaterialProfileId, ApplyPbrProfileOptions };
export {
  applyPbrMaterialProfile,
  applyPbrMaterialProfileToMaterial,
  cyclePbrProfile,
  getPbrMaterialProfile,
  PBR_MATERIAL_PROFILES,
  profileIndex,
} from "./pbrMaterialProfiles";
