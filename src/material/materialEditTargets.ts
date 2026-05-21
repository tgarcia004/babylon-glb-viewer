import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";

export interface MaterialEditTarget {
  meshLabel: string;
  mesh: AbstractMesh;
  material: Material;
}

function collectMeshes(node: Node): AbstractMesh[] {
  const found: AbstractMesh[] = [];
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current instanceof AbstractMesh && current.getTotalVertices() > 0) {
      found.push(current);
    }
    for (const child of current.getChildren(() => true, false)) {
      stack.push(child);
    }
  }
  return found;
}

/** Meshes on this hierarchy node that carry an editable material. */
export function getMaterialEditTargets(node: Node): MaterialEditTarget[] {
  const meshes = collectMeshes(node);
  const targets: MaterialEditTarget[] = [];
  const seen = new Set<number>();

  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat || seen.has(mat.uniqueId)) continue;
    seen.add(mat.uniqueId);
    targets.push({
      meshLabel: mesh.name || "Mesh",
      mesh,
      material: mat,
    });
  }

  return targets;
}

export function isEditablePbr(material: Material): material is PBRMaterial {
  return material instanceof PBRMaterial;
}
