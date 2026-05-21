import { isModelFile } from "./viewportEmptyState";

/** File picker for the model upload zone (drops use modelFileDrop.ts). */
export function wireModelUpload(
  onFile: (file: File) => void,
  onRejected?: (file: File) => void,
): void {
  const input = document.querySelector<HTMLInputElement>("#model-upload");
  if (!input) return;

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (isModelFile(file)) {
      onFile(file);
    } else {
      onRejected?.(file);
    }
  });
}
