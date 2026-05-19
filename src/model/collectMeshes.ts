import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";

/** Every renderable mesh in an import (roots + descendants). */
export function collectRenderableMeshes(roots: AbstractMesh[]): Mesh[] {
  const found = new Set<Mesh>();

  for (const root of roots) {
    const stack: AbstractMesh[] = [root];
    while (stack.length > 0) {
      const node = stack.pop()!;
      if (node instanceof Mesh && node.getTotalVertices() > 0) {
        found.add(node);
      }
      for (const child of node.getChildMeshes(false)) {
        stack.push(child);
      }
    }
  }

  return Array.from(found);
}

export interface ImportMeshSummary {
  meshCount: number;
  triangleCount: number;
  looksLikeShellStack: boolean;
  singleMeshOnly: boolean;
}

export function summarizeImport(meshes: Mesh[]): ImportMeshSummary {
  let triangleCount = 0;
  for (const mesh of meshes) {
    triangleCount += Math.floor((mesh.getIndices()?.length ?? 0) / 3);
  }
  const meshCount = meshes.length;
  return {
    meshCount,
    triangleCount,
    looksLikeShellStack: meshCount > 2,
    singleMeshOnly: meshCount <= 1,
  };
}

export function formatImportStatus(summary: ImportMeshSummary, fileName: string): string {
  const parts = [`${summary.meshCount} mesh${summary.meshCount === 1 ? "" : "es"}`, `${summary.triangleCount.toLocaleString()} tris`];
  if (summary.singleMeshOnly) {
    parts.push("no shell meshes in file — apply Geometry Nodes before export");
  } else if (summary.looksLikeShellStack) {
    parts.push("shell stack detected");
  }
  return `${fileName} · ${parts.join(" · ")}`;
}
