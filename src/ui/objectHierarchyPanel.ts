import {
  buildHierarchyForest,
  countHierarchyNodes,
  findHierarchyNode,
  type HierarchyNode,
} from "../model/buildHierarchyTree";
import type { Node } from "@babylonjs/core/node";
import { renderMaterialInspector } from "./materialInspectorPanel";
import { getViewerBridge, onViewerImportStateChanged } from "../viewer/viewerBridge";

function kindLabel(kind: HierarchyNode["kind"]): string {
  if (kind === "fur-hull") return "Fur hull";
  if (kind === "fur-shell") return "Fur shell";
  if (kind === "mesh") return "Mesh";
  if (kind === "empty") return "Empty mesh";
  return "Transform";
}

function formatMeta(node: HierarchyNode): string {
  const parts: string[] = [kindLabel(node.kind)];
  if (node.triangleCount > 0) {
    parts.push(`${node.triangleCount.toLocaleString()} tris`);
  } else if (node.vertexCount > 0) {
    parts.push(`${node.vertexCount.toLocaleString()} verts`);
  }
  if (!node.enabled || !node.visible) {
    parts.push("hidden");
  }
  return parts.join(" · ");
}

function renderTreeNode(node: HierarchyNode, depth: number, selectedId: string | null): HTMLElement {
  const hasChildren = node.children.length > 0;
  const li = document.createElement("li");
  li.className = "hierarchy-node";
  li.dataset.uniqueId = node.id;

  const row = document.createElement("div");
  row.className = "hierarchy-row";
  if (node.id === selectedId) {
    row.classList.add("is-selected");
  }
  row.style.setProperty("--depth", String(depth));

  if (hasChildren) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "hierarchy-toggle";
    toggle.setAttribute("aria-expanded", "true");
    toggle.setAttribute("aria-label", "Collapse");
    toggle.textContent = "▾";
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "hierarchy-toggle-spacer";
    spacer.setAttribute("aria-hidden", "true");
    row.appendChild(spacer);
  }

  const label = document.createElement("button");
  label.type = "button";
  label.className = "hierarchy-label";
  label.title = node.name;

  const nameEl = document.createElement("span");
  nameEl.className = "hierarchy-name";
  nameEl.textContent = node.name;

  const metaEl = document.createElement("span");
  metaEl.className = "hierarchy-meta";
  metaEl.textContent = formatMeta(node);

  label.append(nameEl, metaEl);
  row.appendChild(label);
  li.appendChild(row);

  if (hasChildren) {
    const childList = document.createElement("ul");
    childList.className = "hierarchy-children";
    for (const child of node.children) {
      childList.appendChild(renderTreeNode(child, depth + 1, selectedId));
    }
    li.appendChild(childList);

    const toggle = row.querySelector<HTMLButtonElement>(".hierarchy-toggle");
    toggle?.addEventListener("click", (e) => {
      e.stopPropagation();
      const collapsed = childList.hidden;
      childList.hidden = !collapsed;
      toggle.setAttribute("aria-expanded", collapsed ? "true" : "false");
      toggle.setAttribute("aria-label", collapsed ? "Collapse" : "Expand");
      toggle.textContent = collapsed ? "▾" : "▸";
    });
  }

  label.addEventListener("click", () => {
    getViewerBridge()?.selectByUniqueId(node.uniqueId);
    setSelectedNodeId(node.id);
    showNodeDetail(node);
  });

  return li;
}

let selectedNodeId: string | null = null;
let lastForest: HierarchyNode[] = [];

function setSelectedNodeId(id: string | null): void {
  selectedNodeId = id;
  const tree = document.getElementById("object-hierarchy-tree");
  if (!tree) return;
  for (const li of tree.querySelectorAll<HTMLElement>(".hierarchy-node")) {
    const row = li.querySelector<HTMLElement>(".hierarchy-row");
    row?.classList.toggle("is-selected", li.dataset.uniqueId === id);
  }
}

function showNodeDetail(node: HierarchyNode, force = false): void {
  const detail = document.getElementById("object-hierarchy-detail");
  if (!detail) return;

  const nodeId = String(node.uniqueId);
  if (!force && detail.dataset.selectedUniqueId === nodeId && detail.querySelector(".mat-inspector")) {
    return;
  }

  const scrollTop = detail.scrollTop;
  detail.dataset.selectedUniqueId = nodeId;

  const lines = [
    ["Name", node.name],
    ["Type", kindLabel(node.kind)],
    ["Triangles", node.triangleCount > 0 ? node.triangleCount.toLocaleString() : "—"],
    ["Vertices", node.vertexCount > 0 ? node.vertexCount.toLocaleString() : "—"],
    ["Material", node.materialName ?? "—"],
    ["Visible", node.visible && node.enabled ? "Yes" : "No"],
  ];

  detail.replaceChildren();
  const title = document.createElement("p");
  title.className = "hierarchy-detail-title";
  title.textContent = "Selection";
  detail.appendChild(title);

  const dl = document.createElement("dl");
  dl.className = "hierarchy-detail-grid";
  for (const [term, value] of lines) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  detail.appendChild(dl);

  const sceneNode = getViewerBridge()?.findNodeByUniqueId(node.uniqueId) ?? null;
  renderMaterialInspector(detail, sceneNode);
  requestAnimationFrame(() => {
    detail.scrollTop = scrollTop;
  });
}

function renderTree(forest: HierarchyNode[]): void {
  const tree = document.getElementById("object-hierarchy-tree");
  const empty = document.getElementById("object-hierarchy-empty");
  const summary = document.getElementById("object-hierarchy-summary");
  if (!tree || !empty) return;

  if (forest.length === 0) {
    tree.replaceChildren();
    tree.hidden = true;
    empty.hidden = false;
    if (summary) summary.textContent = "";
    return;
  }

  empty.hidden = true;
  tree.hidden = false;

  const rootList = document.createElement("ul");
  rootList.className = "hierarchy-root";
  for (const node of forest) {
    rootList.appendChild(renderTreeNode(node, 0, selectedNodeId));
  }
  const treeScrollTop = tree.scrollTop;
  tree.replaceChildren(rootList);
  tree.scrollTop = treeScrollTop;

  const total = countHierarchyNodes(forest);
  if (summary) {
    const bridge = getViewerBridge();
    const fur = bridge?.getFurState();
    if (fur?.enabled) {
      summary.textContent = `Fur preview · ${fur.shellCount} shell${fur.shellCount === 1 ? "" : "s"} · ${total} node${total === 1 ? "" : "s"}`;
    } else {
      summary.textContent = `${total} node${total === 1 ? "" : "s"} · ${forest.length} root${forest.length === 1 ? "" : "s"}`;
    }
  }
}

/** Update fur shell count in the header without rebuilding the tree or inspector. */
export function refreshHierarchySummary(): void {
  const summary = document.getElementById("object-hierarchy-summary");
  if (!summary || lastForest.length === 0) return;

  const bridge = getViewerBridge();
  const fur = bridge?.getFurState();
  const total = countHierarchyNodes(lastForest);
  if (fur?.enabled) {
    summary.textContent = `Fur preview · ${fur.shellCount} shell${fur.shellCount === 1 ? "" : "s"} · ${total} node${total === 1 ? "" : "s"}`;
  } else {
    summary.textContent = `${total} node${total === 1 ? "" : "s"} · ${lastForest.length} root${lastForest.length === 1 ? "" : "s"}`;
  }
}

function refreshFromBridge(): void {
  const bridge = getViewerBridge();
  const fileEl = document.getElementById("object-hierarchy-file");
  const detail = document.getElementById("object-hierarchy-detail");

  if (!bridge) {
    renderTree([]);
    if (fileEl) fileEl.textContent = "";
    if (detail) detail.replaceChildren();
    return;
  }

  const state = bridge.getImportState();
  if (fileEl) {
    fileEl.textContent = state.fileName ?? "No model loaded";
  }

  lastForest = buildHierarchyForest(state.roots);
  renderTree(lastForest);

  if (selectedNodeId) {
    const node = findHierarchyNode(lastForest, Number(selectedNodeId));
    if (node) {
      showNodeDetail(node);
    } else {
      setSelectedNodeId(null);
      detail?.replaceChildren();
    }
  } else if (lastForest.length === 0 && detail) {
    detail.replaceChildren();
  }
}

export function initObjectHierarchyPanel(): void {
  onViewerImportStateChanged(() => refreshFromBridge());
  refreshFromBridge();

  document.getElementById("hierarchy-expand-all")?.addEventListener("click", () => {
    const tree = document.getElementById("object-hierarchy-tree");
    if (!tree) return;
    for (const list of tree.querySelectorAll<HTMLElement>(".hierarchy-children")) {
      list.hidden = false;
    }
    for (const btn of tree.querySelectorAll<HTMLButtonElement>(".hierarchy-toggle")) {
      btn.setAttribute("aria-expanded", "true");
      btn.textContent = "▾";
    }
  });

  document.getElementById("hierarchy-collapse-all")?.addEventListener("click", () => {
    const tree = document.getElementById("object-hierarchy-tree");
    if (!tree) return;
    for (const list of tree.querySelectorAll<HTMLElement>(".hierarchy-children")) {
      list.hidden = true;
    }
    for (const btn of tree.querySelectorAll<HTMLButtonElement>(".hierarchy-toggle")) {
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "▸";
    }
  });
}

export function notifyHierarchySelection(uniqueId: number | null): void {
  setSelectedNodeId(uniqueId != null ? String(uniqueId) : null);
  const detail = document.getElementById("object-hierarchy-detail");
  if (uniqueId == null) {
    detail?.replaceChildren();
    if (detail) delete detail.dataset.selectedUniqueId;
    return;
  }
  const node = findHierarchyNode(lastForest, uniqueId);
  if (node) {
    showNodeDetail(node, true);
  }
}
