import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Scene } from "@babylonjs/core/scene";

const GLTF_PLUGIN_OPTIONS = {
  gltf: { compileMaterials: true, skipMaterials: false, useSRGBBuffers: true },
} as const;

export function modelFileExtension(file: File): ".glb" | ".gltf" {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gltf")) return ".gltf";
  if (name.endsWith(".glb")) return ".glb";
  if (file.type === "model/gltf+json") return ".gltf";
  return ".glb";
}

export interface ModelImportResult {
  container: AssetContainer;
  roots: AbstractMesh[];
}

/** Load GLB/glTF into the scene (object URL + asset container — reliable for drag-and-drop). */
export async function importModelFile(scene: Scene, file: File): Promise<ModelImportResult> {
  const ext = modelFileExtension(file);
  const displayName = file.name || `model${ext}`;
  const meshCountBefore = scene.meshes.length;
  const options = {
    pluginExtension: ext,
    name: displayName,
    pluginOptions: GLTF_PLUGIN_OPTIONS,
  };

  let container: AssetContainer | null = null;
  const objectUrl = URL.createObjectURL(file);
  try {
    try {
      container = await LoadAssetContainerAsync(objectUrl, scene, options);
    } catch (urlErr) {
      const buffer = await file.arrayBuffer();
      try {
        container = await LoadAssetContainerAsync(new Uint8Array(buffer), scene, options);
      } catch (bufferErr) {
        const msg =
          bufferErr instanceof Error
            ? bufferErr.message
            : urlErr instanceof Error
              ? urlErr.message
              : "Failed to load model.";
        throw new Error(msg);
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (!container) {
    throw new Error("Failed to load model.");
  }

  container.addAllToScene();

  let roots = container.meshes.filter((m) => !m.isDisposed());
  if (roots.length === 0) {
    roots = scene.meshes.slice(meshCountBefore).filter((m) => !m.isDisposed());
  }

  return { container, roots };
}
