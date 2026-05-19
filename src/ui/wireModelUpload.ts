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

/** File picker + drag-and-drop for the model upload zone. */
export function wireModelUpload(panel: HTMLElement, onFile: (file: File) => void): void {
  const zone = panel.querySelector<HTMLElement>(".upload-zone");
  const input = panel.querySelector<HTMLInputElement>("#model-upload");

  input?.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) void onFile(file);
    input.value = "";
  });

  if (!zone) return;

  zone.addEventListener("dragenter", (e) => {
    preventFileDragDefaults(e);
    zone.classList.add("is-dragover");
  });

  zone.addEventListener("dragover", (e) => {
    preventFileDragDefaults(e);
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    zone.classList.add("is-dragover");
  });

  zone.addEventListener("dragleave", (e) => {
    preventFileDragDefaults(e);
    const related = e.relatedTarget;
    if (!related || !zone.contains(related as Node)) {
      zone.classList.remove("is-dragover");
    }
  });

  zone.addEventListener("drop", (e) => {
    preventFileDragDefaults(e);
    zone.classList.remove("is-dragover");
    const file = e.dataTransfer?.files?.[0];
    if (file && isModelFile(file)) void onFile(file);
  });

  const layout = document.getElementById("layout");
  if (!layout) return;

  layout.addEventListener("dragover", (e) => {
    if (e.dataTransfer?.types.includes("Files")) preventFileDragDefaults(e);
  });

  const viewport = document.getElementById("viewport");

  layout.addEventListener("drop", (e) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    const target = e.target;
    if (target instanceof Node && zone.contains(target)) return;
    preventFileDragDefaults(e);
    const file = e.dataTransfer.files?.[0];
    if (!file || !isModelFile(file)) return;
    if (target instanceof Node && viewport?.contains(target)) {
      void onFile(file);
    }
  });
}
