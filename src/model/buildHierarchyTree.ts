import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Node } from "@babylonjs/core/node";

export type HierarchyNodeKind = "transform" | "mesh" | "empty";

export interface HierarchyNode {
  id: string;
  uniqueId: number;
  name: string;
  kind: HierarchyNodeKind;
  visible: boolean;
  enabled: boolean;
  triangleCount: number;
  vertexCount: number;
  materialName: string | null;
  children: HierarchyNode[];
}

function nodeKind(node: Node): HierarchyNodeKind {
  if (node instanceof Mesh) {
    return node.getTotalVertices() > 0 ? "mesh" : "empty";
  }
  if (node instanceof AbstractMesh) {
    return "empty";
  }
  return "transform";
}

function meshStats(node: Node): { triangleCount: number; vertexCount: number; materialName: string | null } {
  if (!(node instanceof AbstractMesh)) {
    return { triangleCount: 0, vertexCount: 0, materialName: null };
  }
  const vertexCount = node.getTotalVertices();
  const triangleCount = Math.floor((node.getIndices()?.length ?? 0) / 3);
  const materialName = node.material?.name ?? null;
  return { triangleCount, vertexCount, materialName };
}

function isVisibleInScene(node: Node): boolean {
  if (node instanceof AbstractMesh) {
    return node.isVisible && node.isEnabled();
  }
  if (node instanceof TransformNode) {
    return node.isEnabled();
  }
  return true;
}

function childNodes(node: Node): Node[] {
  return node.getChildren(() => true, false).filter((c) => c instanceof AbstractMesh || c instanceof TransformNode);
}

function buildNode(node: Node): HierarchyNode {
  const stats = meshStats(node);
  const children = childNodes(node).map((c) => buildNode(c));
  return {
    id: String(node.uniqueId),
    uniqueId: node.uniqueId,
    name: node.name || "(unnamed)",
    kind: nodeKind(node),
    visible: node instanceof AbstractMesh ? node.isVisible : true,
    enabled: isVisibleInScene(node),
    triangleCount: stats.triangleCount,
    vertexCount: stats.vertexCount,
    materialName: stats.materialName,
    children,
  };
}

/** Top-level nodes for the imported model (excludes nested meshes listed as import roots). */
export function findImportHierarchyRoots(importedMeshes: AbstractMesh[]): Node[] {
  const meshSet = new Set(importedMeshes);
  const roots: Node[] = [];

  for (const mesh of importedMeshes) {
    if (mesh.isDisposed()) continue;
    let parent: Node | null = mesh.parent;
    let nestedUnderImport = false;
    while (parent) {
      if (meshSet.has(parent as AbstractMesh)) {
        nestedUnderImport = true;
        break;
      }
      parent = parent.parent;
    }
    if (!nestedUnderImport) {
      roots.push(mesh);
    }
  }

  const seen = new Set<number>();
  const deduped: Node[] = [];
  for (const root of roots) {
    if (seen.has(root.uniqueId)) continue;
    seen.add(root.uniqueId);
    deduped.push(root);
  }

  return deduped;
}

export function buildHierarchyForest(importedMeshes: AbstractMesh[]): HierarchyNode[] {
  const roots = findImportHierarchyRoots(importedMeshes);
  return roots.map((r) => buildNode(r));
}

export function findHierarchyNode(forest: HierarchyNode[], uniqueId: number): HierarchyNode | null {
  for (const node of forest) {
    if (node.uniqueId === uniqueId) {
      return node;
    }
    const nested = findHierarchyNode(node.children, uniqueId);
    if (nested) {
      return nested;
    }
  }
  return null;
}

export function countHierarchyNodes(nodes: HierarchyNode[]): number {
  let n = 0;
  const walk = (list: HierarchyNode[]) => {
    for (const node of list) {
      n += 1;
      walk(node.children);
    }
  };
  walk(nodes);
  return n;
}
