function isModelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    name.endsWith(".glb") ||
    name.endsWith(".gltf") ||
    file.type === "model/gltf-binary" ||
    file.type === "model/gltf+json"
  );
}

function preventFileDragDefaults(e: DragEvent): void {
  e.preventDefault();
  e.stopPropagation();
}

export interface ViewportEmptyState {
  setVisible: (visible: boolean) => void;
}

/** Centered viewport prompt when no model is loaded; accepts GLB/glTF drops. */
export function initViewportEmptyState(onFile: (file: File) => void): ViewportEmptyState {
  const root = document.getElementById("viewport-empty");
  const viewport = document.getElementById("viewport");
  const browseBtn = root?.querySelector<HTMLButtonElement>(".viewport-empty-browse");
  const fileInput = document.querySelector<HTMLInputElement>("#model-upload");

  const setVisible = (visible: boolean) => {
    if (!root) return;
    root.classList.toggle("is-hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
  };

  const setDragover = (active: boolean) => {
    root?.classList.toggle("is-dragover", active);
    viewport?.classList.toggle("is-model-dragover", active);
  };

  const handleFile = (file: File | undefined) => {
    if (file && isModelFile(file)) void onFile(file);
  };

  browseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput?.click();
  });

  const bindDropTarget = (el: HTMLElement) => {
    el.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      preventFileDragDefaults(e);
      setDragover(true);
    });

    el.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      preventFileDragDefaults(e);
      e.dataTransfer.dropEffect = "copy";
      setDragover(true);
    });

    el.addEventListener("dragleave", (e) => {
      const related = e.relatedTarget;
      if (related && el.contains(related as Node)) return;
      if (viewport && related && viewport.contains(related as Node) && el !== viewport) return;
      setDragover(false);
    });

    el.addEventListener("drop", (e) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      preventFileDragDefaults(e);
      setDragover(false);
      handleFile(e.dataTransfer.files?.[0]);
    });
  };

  if (root) bindDropTarget(root);
  if (viewport) bindDropTarget(viewport);

  return { setVisible };
}
