export function isModelFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith(".glb") || name.endsWith(".gltf")) {
    return true;
  }
  if (file.type === "model/gltf-binary" || file.type === "model/gltf+json") {
    return true;
  }
  if (file.type === "application/octet-stream" && (name.endsWith(".glb") || name.endsWith(".gltf"))) {
    return true;
  }
  // Windows: dropped path may arrive without extension in the name field.
  if (file.size > 0 && !name.includes(".")) {
    return true;
  }
  return false;
}

export interface ViewportEmptyState {
  setVisible: (visible: boolean) => void;
  setStatus: (message: string) => void;
  resetStatus: () => void;
}

/** Centered viewport prompt when no model is loaded. File drops use modelFileDrop.ts. */
export function initViewportEmptyState(): ViewportEmptyState {
  const root = document.getElementById("viewport-empty");
  const browseBtn = root?.querySelector<HTMLButtonElement>(".viewport-empty-browse");
  const titleEl = root?.querySelector<HTMLElement>(".viewport-empty-title");
  const hintEl = root?.querySelector<HTMLElement>(".viewport-empty-hint");
  const fileInput = document.querySelector<HTMLInputElement>("#model-upload");
  const defaultTitle = titleEl?.textContent ?? "Drop your model here";
  const defaultHint = hintEl?.textContent ?? "GLB or glTF · drag onto the view or use the panel";

  const setVisible = (visible: boolean) => {
    if (!root) return;
    root.classList.toggle("is-hidden", !visible);
    root.setAttribute("aria-hidden", visible ? "false" : "true");
  };

  const setStatus = (message: string) => {
    if (titleEl) titleEl.textContent = message;
  };

  const resetStatus = () => {
    if (titleEl) titleEl.textContent = defaultTitle;
    if (hintEl) hintEl.textContent = defaultHint;
  };

  browseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    fileInput?.click();
  });

  return { setVisible, setStatus, resetStatus };
}
