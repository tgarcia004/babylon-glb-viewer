import { openLocalFilePicker } from "./localFilePicker";
import { openHostModelBrowser } from "./hostModelBrowser";

export function initModelSourcePicker(): void {
  document.getElementById("model-browse-local")?.addEventListener("click", (e) => {
    e.preventDefault();
    openLocalFilePicker();
  });

  document.getElementById("model-browse-host")?.addEventListener("click", (e) => {
    e.preventDefault();
    openHostModelBrowser();
  });

  document.getElementById("viewport-browse-local")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLocalFilePicker();
  });

  document.getElementById("viewport-browse-host")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openHostModelBrowser();
  });
}
