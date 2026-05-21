import type { FurMaterial } from "@babylonjs/materials/fur";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Node } from "@babylonjs/core/node";

import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";

import type { FurInspectorDefaults, FurInspectorSlotId } from "../fur/furInspectorDefaults";

export interface ViewerImportState {
  roots: AbstractMesh[];
  fileName: string | null;
  /** When true, the outliner shows the fur hull + shell stack only. */
  furEnabled: boolean;
}

export interface ViewerFurState {
  enabled: boolean;
  hullUniqueId: number | null;
  masterMaterial: FurMaterial | null;
  shellCount: number;
}

export interface ViewerBridge {
  getImportState(): ViewerImportState;
  getFurState(): ViewerFurState;
  findNodeByUniqueId(uniqueId: number): Node | null;
  selectByUniqueId(uniqueId: number): void;
  clearSelection(): void;
  /** After editing fur material textures / colors in the inspector. */
  syncFurMaterials(): void;
  /** Baselines from when fur was last built (for Edit Object “Default” actions). */
  getFurInspectorDefaults(): FurInspectorDefaults | null;
  canRestoreFurSlot(slotId: FurInspectorSlotId): boolean;
  restoreFurInspectorSlot(slotId: FurInspectorSlotId): boolean;
  restoreFurInspectorProperties(): void | Promise<void>;
  getFurDensityMask(): BaseTexture | null;
  applyFurDensityMask(mask: Texture): Promise<void>;
  clearFurDensityMask(): Promise<void>;
  getFurShellLift(): number;
  setFurShellLift(value: number): void;
  getFurStackDepth(): number;
  setFurStackDepth(value: number): void;
  getFurQuality(): number;
  setFurQuality(value: number): void;
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
