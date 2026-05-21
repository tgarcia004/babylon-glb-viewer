import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { FurMaterial } from "@babylonjs/materials/fur";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Node } from "@babylonjs/core/node";
import { Tags } from "@babylonjs/core/Misc/tags";

import { getViewerBridge } from "../viewer/viewerBridge";

export interface MaterialEditTarget {
  meshLabel: string;
  mesh: AbstractMesh;
  material: Material;
}

function nodeContainsTarget(root: Node, target: Node): boolean {
  if (root === target) return true;
  for (const child of root.getChildren(() => true, false)) {
    if (nodeContainsTarget(child, target)) return true;
  }
  return false;
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

function furEditTarget(node: Node): MaterialEditTarget | null {
  const bridge = getViewerBridge();
  if (!bridge) return null;
  const fur = bridge.getFurState();
  if (!fur.enabled || !fur.masterMaterial || fur.hullUniqueId == null) {
    return null;
  }

  const hull = bridge.findNodeByUniqueId(fur.hullUniqueId);
  if (!(hull instanceof AbstractMesh) || !nodeContainsTarget(node, hull)) {
    return null;
  }

  return {
    meshLabel: hull.name ? `${hull.name} · fur` : "Fur hull",
    mesh: hull,
    material: fur.masterMaterial,
  };
}

/** Meshes on this hierarchy node that carry an editable material. */
export function getMaterialEditTargets(node: Node): MaterialEditTarget[] {
  const furTarget = furEditTarget(node);
  if (furTarget) {
    return [furTarget];
  }

  const meshes = collectMeshes(node);
  const targets: MaterialEditTarget[] = [];
  const seen = new Set<number>();

  for (const mesh of meshes) {
    const mat = mesh.material;
    if (!mat || seen.has(mat.uniqueId)) continue;
    if (Tags.MatchesQuery(mat, "furShellMaterial")) continue;
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

export function isEditableFur(material: Material): material is FurMaterial {
  return material instanceof FurMaterial;
}

export function isFurShellMesh(mesh: AbstractMesh): boolean {
  const mat = mesh.material;
  return !!mat && Tags.MatchesQuery(mat, "furShellMaterial");
}

/** Highlight fur hull or individual shell in the viewport. */
export function pickHighlightMeshes(node: Node): Mesh[] {
  if (node instanceof Mesh && node.getTotalVertices() > 0) {
    return [node];
  }
  return [];
}
