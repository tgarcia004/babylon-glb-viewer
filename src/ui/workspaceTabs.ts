import { getViewerBridge } from "../viewer/viewerBridge";

export type WorkspaceId = "preview" | "edit-object";

const STORAGE_KEY = "glb-studio-workspace";

export function initWorkspaceTabs(): void {
  const layout = document.getElementById("layout");
  const tabs = document.querySelectorAll<HTMLButtonElement>(".workspace-tab");
  const pages = document.querySelectorAll<HTMLElement>(".workspace-page");

  if (!layout || tabs.length === 0) return;

  const load = (): WorkspaceId => {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw === "edit-object" ? "edit-object" : "preview";
  };

  const apply = (id: WorkspaceId) => {
    layout.dataset.workspace = id;
    for (const tab of tabs) {
      const active = tab.dataset.workspace === id;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
    }
    for (const page of pages) {
      const active = page.dataset.workspacePage === id;
      page.classList.toggle("is-active", active);
      page.hidden = !active;
    }
    sessionStorage.setItem(STORAGE_KEY, id);

    if (id === "preview") {
      getViewerBridge()?.clearSelection();
    }
  };

  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const id = tab.dataset.workspace as WorkspaceId | undefined;
      if (id) apply(id);
    });
  }

  apply(load());
}
