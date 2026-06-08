let fileInput: HTMLInputElement | null = null;

/** Keep #model-upload off-screen (not `display:none`) so programmatic .click() opens reliably. */
export function prepLocalFileInput(): void {
  fileInput = document.querySelector<HTMLInputElement>("#model-upload");
  if (!fileInput) return;

  fileInput.removeAttribute("hidden");
  fileInput.classList.add("sr-only-file-input");
  fileInput.accept = ".glb,.gltf";
}

/** Open the OS file picker on the same user gesture. Uses #model-upload; wireModelUpload handles the file. */
export function openLocalFilePicker(): void {
  if (!fileInput) {
    fileInput = document.querySelector<HTMLInputElement>("#model-upload");
  }
  if (!fileInput) return;

  fileInput.value = "";
  fileInput.click();
}
