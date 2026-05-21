import "./styles/app.css";
import { runFurDemo } from "./examples/furDemoExample";
import { initModelFileDrop } from "./ui/modelFileDrop";
import { initPreventBrowserFileDrop } from "./ui/preventBrowserFileDrop";
import { initCollapsiblePanel } from "./ui/collapsiblePanel";
import { initThemeSwitcher } from "./ui/theme";
import { initViewportFocusToggle } from "./ui/viewportFocusToggle";
import { initViewportPerfIndicator } from "./ui/viewportPerfIndicator";
import { initPanelResize } from "./ui/panelResize";
import { initWorkspaceTabs } from "./ui/workspaceTabs";

initPreventBrowserFileDrop();
initModelFileDrop();
initThemeSwitcher();
initWorkspaceTabs();
initPanelResize();
initCollapsiblePanel();
initViewportFocusToggle();
initViewportPerfIndicator();

const canvas = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
if (!canvas) {
  throw new Error("Missing #renderCanvas");
}

const panel = document.getElementById("fur-panel");

runFurDemo(canvas, panel).catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
});
