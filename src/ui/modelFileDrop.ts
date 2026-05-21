/**
 * Global GLB/glTF drag-and-drop. Uses window capture listeners so drops work
 * regardless of pointer-events, collapsed panels, or overlay stacking.
 * Scene preset .json drops on #scene-import-json are left for wireSceneSnapshot.ts.
 */

import { isModelFile } from "./viewportEmptyState";

export type ModelFileHandler = (file: File) => void;

function isJsonPresetFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith(".json") || file.type === "application/json";
}

function getSceneImportJsonBtn(): HTMLElement | null {
  return document.getElementById("scene-import-json");
}

function isOverSceneImportJson(e: DragEvent): boolean {
  const btn = getSceneImportJsonBtn();
  return btn ? pointIn(btn, e) : false;
}

let onModelFile: ModelFileHandler | null = null;
let onRejected: ((file: File) => void) | null = null;
let initialized = false;
const pendingFiles: File[] = [];

let dragActive = false;
let overViewport = false;

function getViewport(): HTMLElement | null {
  return document.getElementById("viewport");
}

function getViewportEmpty(): HTMLElement | null {
  return document.getElementById("viewport-empty");
}

function getUploadZone(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".upload-zone");
}

function setViewportHighlight(on: boolean): void {
  getViewport()?.classList.toggle("is-model-dragover", on);
  getViewportEmpty()?.classList.toggle("is-dragover", on);
}

function setZoneHighlight(on: boolean): void {
  getUploadZone()?.classList.toggle("is-dragover", on);
}

function pointIn(el: HTMLElement, e: DragEvent): boolean {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}

/** Desktop file drags — permissive so Windows works during dragover and on drop. */
function isOsFileDrag(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt) return false;

  const types = Array.from(dt.types);
  if (types.includes("Files") || types.includes("application/x-moz-file")) {
    return true;
  }

  if (e.type === "drop") {
    return (dt.files?.length ?? 0) > 0;
  }

  // Explorer → browser: types often empty until drop.
  if (e.type === "dragenter" || e.type === "dragover") {
    return types.length === 0 || !types.includes("text/html");
  }

  return false;
}

function acceptFile(file: File): void {
  if (!file.size || isJsonPresetFile(file) || !isModelFile(file)) return;
  if (!onModelFile) {
    pendingFiles.push(file);
    return;
  }
  onModelFile(file);
}

function flushPendingFiles(): void {
  if (!onModelFile || pendingFiles.length === 0) return;
  const queued = pendingFiles.splice(0);
  for (const file of queued) {
    if (isJsonPresetFile(file) || !isModelFile(file)) continue;
    onModelFile(file);
  }
}

function updateHighlights(e: DragEvent): void {
  const viewport = getViewport();
  const zone = getUploadZone();

  const vpOn = viewport ? pointIn(viewport, e) : false;
  if (vpOn !== overViewport) {
    overViewport = vpOn;
    setViewportHighlight(vpOn);
  }

  const zoneOn = zone ? pointIn(zone, e) : false;
  setZoneHighlight(zoneOn);
}

function clearHighlights(): void {
  dragActive = false;
  overViewport = false;
  setViewportHighlight(false);
  setZoneHighlight(false);
}

export function registerModelFileHandlers(handlers: {
  onFile: ModelFileHandler;
  onRejected?: (file: File) => void;
}): void {
  onModelFile = handlers.onFile;
  onRejected = handlers.onRejected ?? null;
  flushPendingFiles();
}

export function initModelFileDrop(): void {
  if (initialized) return;
  initialized = true;

  window.addEventListener(
    "dragenter",
    (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      dragActive = true;
      updateHighlights(e);
    },
    true,
  );

  window.addEventListener(
    "dragover",
    (e) => {
      if (!isOsFileDrag(e)) return;
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
      dragActive = true;
      updateHighlights(e);
    },
    true,
  );

  window.addEventListener(
    "dragleave",
    (e) => {
      if (!dragActive) return;
      if (e.relatedTarget != null) return;
      clearHighlights();
    },
    true,
  );

  window.addEventListener(
    "drop",
    (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) {
        clearHighlights();
        return;
      }

      clearHighlights();

      // Scene preset JSON — let #scene-import-json handle it (bubble phase).
      if (isJsonPresetFile(file)) {
        if (isOverSceneImportJson(e)) {
          return;
        }
        return;
      }

      if (!isModelFile(file)) {
        onRejected?.(file);
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      acceptFile(file);
    },
    true,
  );
}
