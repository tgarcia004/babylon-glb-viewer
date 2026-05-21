import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";

export interface ViewerImportState {
  roots: AbstractMesh[];
  fileName: string | null;
}

export interface ViewerBridge {
  getImportState(): ViewerImportState;
  findNodeByUniqueId(uniqueId: number): Node | null;
  selectByUniqueId(uniqueId: number): void;
  clearSelection(): void;
}

type ImportListener = (state: ViewerImportState) => void;

let bridge: ViewerBridge | null = null;
const importListeners = new Set<ImportListener>();

export function registerViewerBridge(next: ViewerBridge | null): void {
  bridge = next;
  if (next) {
    emitViewerImportState(next.getImportState());
  }
}

export function getViewerBridge(): ViewerBridge | null {
  return bridge;
}

export function onViewerImportStateChanged(listener: ImportListener): () => void {
  importListeners.add(listener);
  if (bridge) {
    listener(bridge.getImportState());
  }
  return () => importListeners.delete(listener);
}

export function emitViewerImportState(state: ViewerImportState): void {
  for (const listener of importListeners) {
    listener(state);
  }
}
