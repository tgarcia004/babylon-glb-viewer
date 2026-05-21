import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { GetTextureDataAsync } from "@babylonjs/core/Misc/textureTools";
import type { Node } from "@babylonjs/core/node";

import { getMaterialEditTargets, isEditablePbr, type MaterialEditTarget } from "../material/materialEditTargets";

interface TextureSlotDef {
  id: string;
  label: string;
  getTexture: (mat: PBRMaterial) => BaseTexture | null;
  setTexture: (mat: PBRMaterial, tex: Texture | null) => void;
}

const PBR_TEXTURE_SLOTS: TextureSlotDef[] = [
  {
    id: "albedo",
    label: "Albedo",
    getTexture: (m) => m.albedoTexture,
    setTexture: (m, t) => {
      m.albedoTexture = t;
    },
  },
  {
    id: "metallic",
    label: "Metallic / rough",
    getTexture: (m) => m.metallicTexture,
    setTexture: (m, t) => {
      m.metallicTexture = t;
    },
  },
  {
    id: "normal",
    label: "Normal",
    getTexture: (m) => m.bumpTexture,
    setTexture: (m, t) => {
      m.bumpTexture = t;
    },
  },
  {
    id: "emissive",
    label: "Emissive",
    getTexture: (m) => m.emissiveTexture,
    setTexture: (m, t) => {
      m.emissiveTexture = t;
    },
  },
  {
    id: "occlusion",
    label: "Occlusion",
    getTexture: (m) => m.ambientTexture,
    setTexture: (m, t) => {
      m.ambientTexture = t;
    },
  },
  {
    id: "opacity",
    label: "Opacity",
    getTexture: (m) => m.opacityTexture,
    setTexture: (m, t) => {
      m.opacityTexture = t;
    },
  },
];

function colorToHex(c: Color3): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function hexToColor3(hex: string): Color3 {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

function markMaterialDirty(mat: Material): void {
  mat.getScene()?.resetCachedMaterial();
}

async function paintTextureThumbFromBuffer(container: HTMLElement, tex: BaseTexture): Promise<void> {
  const placeholder = document.createElement("span");
  placeholder.className = "mat-slot-thumb-empty";
  placeholder.textContent = "…";
  container.replaceChildren(placeholder);

  try {
    const size = 96;
    const data = await GetTextureDataAsync(tex, size, size);
    const canvas = document.createElement("canvas");
    canvas.className = "mat-slot-thumb-img";
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const imageData = ctx.createImageData(size, size);
      imageData.data.set(data);
      ctx.putImageData(imageData, 0, 0);
      container.replaceChildren(canvas);
    }
  } catch {
    placeholder.textContent = "?";
  }
}

async function paintTextureThumb(container: HTMLElement, tex: BaseTexture | null): Promise<void> {
  container.replaceChildren();
  const placeholder = document.createElement("span");
  placeholder.className = "mat-slot-thumb-empty";
  placeholder.textContent = "—";

  if (!tex) {
    container.appendChild(placeholder);
    return;
  }

  if (tex instanceof Texture && tex.url && !tex.url.startsWith("data:")) {
    const img = document.createElement("img");
    img.className = "mat-slot-thumb-img";
    img.alt = tex.name || "Texture";
    img.src = tex.url;
    img.onerror = () => {
      img.remove();
      void paintTextureThumbFromBuffer(container, tex);
    };
    container.appendChild(img);
    return;
  }

  await paintTextureThumbFromBuffer(container, tex);
}

function createTextureSlotCard(mat: PBRMaterial, slot: TextureSlotDef): HTMLElement {
  const card = document.createElement("div");
  card.className = "mat-slot-card";
  card.dataset.slot = slot.id;

  const thumb = document.createElement("div");
  thumb.className = "mat-slot-thumb";
  void paintTextureThumb(thumb, slot.getTexture(mat));

  const label = document.createElement("span");
  label.className = "mat-slot-label";
  label.textContent = slot.label;

  const texName = document.createElement("span");
  texName.className = "mat-slot-texname";
  const current = slot.getTexture(mat);
  texName.textContent = current?.name || "No texture";
  texName.title = current?.name || "";

  const actions = document.createElement("div");
  actions.className = "mat-slot-actions";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,.png,.jpg,.jpeg,.webp,.ktx2,.basis";
  fileInput.hidden = true;

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "mat-slot-btn";
  replaceBtn.textContent = "Replace";

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className = "mat-slot-btn mat-slot-btn--ghost";
  clearBtn.textContent = "Clear";
  clearBtn.disabled = !current;

  replaceBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    const scene = mat.getScene();
    if (!scene) return;

    const objectUrl = URL.createObjectURL(file);
    const tex = new Texture(
      objectUrl,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => {
        URL.revokeObjectURL(objectUrl);
      },
      () => {
        URL.revokeObjectURL(objectUrl);
      },
    );
    tex.name = file.name;
    slot.setTexture(mat, tex);
    markMaterialDirty(mat);
    texName.textContent = file.name;
    clearBtn.disabled = false;
    void paintTextureThumb(thumb, tex);
  });

  clearBtn.addEventListener("click", () => {
    slot.setTexture(mat, null);
    markMaterialDirty(mat);
    texName.textContent = "No texture";
    clearBtn.disabled = true;
    void paintTextureThumb(thumb, null);
  });

  actions.append(replaceBtn, clearBtn);
  card.append(thumb, label, texName, actions, fileInput);
  return card;
}

function createScalarControl(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "mat-prop-row";

  const lbl = document.createElement("label");
  lbl.className = "mat-prop-label";
  lbl.textContent = label;

  const input = document.createElement("input");
  input.type = "range";
  input.className = "mat-prop-range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const val = document.createElement("span");
  val.className = "mat-prop-val";
  val.textContent = format(value);

  input.addEventListener("input", () => {
    const v = parseFloat(input.value);
    val.textContent = format(v);
    onChange(v);
  });

  row.append(lbl, input, val);
  return row;
}

function createPbrPropertyPanel(mat: PBRMaterial): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "mat-props-panel";

  const colorRow = document.createElement("div");
  colorRow.className = "mat-prop-row";
  const colorLbl = document.createElement("label");
  colorLbl.className = "mat-prop-label";
  colorLbl.textContent = "Base color";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "mat-prop-color";
  colorInput.value = colorToHex(mat.albedoColor);
  colorInput.addEventListener("input", () => {
    mat.albedoColor = hexToColor3(colorInput.value);
    markMaterialDirty(mat);
  });
  colorRow.append(colorLbl, colorInput);

  const transparency = document.createElement("div");
  transparency.className = "mat-prop-row";
  const transLbl = document.createElement("label");
  transLbl.className = "mat-prop-label";
  transLbl.textContent = "Transparency";
  const transSelect = document.createElement("select");
  transSelect.className = "mat-prop-select";
  transSelect.innerHTML = `
    <option value="${Material.MATERIAL_OPAQUE}">Opaque</option>
    <option value="${Material.MATERIAL_ALPHATEST}">Alpha test</option>
    <option value="${Material.MATERIAL_ALPHABLEND}">Alpha blend</option>
  `;
  transSelect.value = String(mat.transparencyMode ?? Material.MATERIAL_OPAQUE);
  transSelect.addEventListener("change", () => {
    mat.transparencyMode = parseInt(transSelect.value, 10);
    markMaterialDirty(mat);
  });
  transparency.append(transLbl, transSelect);

  panel.append(
    colorRow,
    transparency,
    createScalarControl("Metallic", mat.metallic ?? 0, 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
      mat.metallic = v;
      markMaterialDirty(mat);
    }),
    createScalarControl("Roughness", mat.roughness ?? 1, 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
      mat.roughness = v;
      markMaterialDirty(mat);
    }),
    createScalarControl("Alpha", mat.alpha, 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
      mat.alpha = v;
      markMaterialDirty(mat);
    }),
    createScalarControl("Alpha cutoff", mat.alphaCutOff, 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
      mat.alphaCutOff = v;
      markMaterialDirty(mat);
    }),
  );

  return panel;
}

function createMaterialGraph(target: MaterialEditTarget, showMeshLabel: boolean): HTMLElement {
  const { material, meshLabel } = target;
  const block = document.createElement("div");
  block.className = "mat-inspector-block";

  if (showMeshLabel) {
    const meshTag = document.createElement("p");
    meshTag.className = "mat-inspector-mesh-tag";
    meshTag.textContent = meshLabel;
    block.appendChild(meshTag);
  }

  const root = document.createElement("div");
  root.className = "mat-node mat-node--root";
  const typeBadge = document.createElement("span");
  typeBadge.className = "mat-node-badge";
  typeBadge.textContent = material.getClassName();
  const nameEl = document.createElement("span");
  nameEl.className = "mat-node-name";
  nameEl.textContent = material.name || "(unnamed)";
  root.append(typeBadge, nameEl);

  const connector = document.createElement("div");
  connector.className = "mat-graph-connector";
  connector.setAttribute("aria-hidden", "true");

  block.append(root, connector);

  if (isEditablePbr(material)) {
    const slotsTitle = document.createElement("p");
    slotsTitle.className = "mat-graph-slots-title";
    slotsTitle.textContent = "Texture slots";

    const grid = document.createElement("div");
    grid.className = "mat-slot-grid";
    for (const slot of PBR_TEXTURE_SLOTS) {
      grid.appendChild(createTextureSlotCard(material, slot));
    }

    const propsTitle = document.createElement("p");
    propsTitle.className = "mat-graph-slots-title";
    propsTitle.textContent = "Material properties";

    block.append(slotsTitle, grid, propsTitle, createPbrPropertyPanel(material));
  } else {
    const note = document.createElement("p");
    note.className = "hint mat-inspector-readonly";
    note.textContent = `${material.getClassName()} is view-only here. Select a PBR mesh to edit textures and sliders.`;
    block.appendChild(note);
  }

  return block;
}

/** Visual material inspector (node cards + texture replace + PBR sliders). */
export function renderMaterialInspector(container: HTMLElement, sceneNode: Node | null): void {
  const section = document.createElement("div");
  section.className = "mat-inspector";

  const title = document.createElement("p");
  title.className = "hierarchy-detail-title";
  title.textContent = "Material editor";
  section.appendChild(title);

  const hint = document.createElement("p");
  hint.className = "hint mat-inspector-hint";
  hint.textContent = "Texture slots connect to the material node. Changes apply live in the viewport.";
  section.appendChild(hint);

  if (!sceneNode) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No materials on this node.";
    section.appendChild(empty);
    container.appendChild(section);
    return;
  }

  const targets = getMaterialEditTargets(sceneNode);
  if (targets.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "No materials on this node.";
    section.appendChild(empty);
    container.appendChild(section);
    return;
  }

  const graph = document.createElement("div");
  graph.className = "mat-inspector-graph";
  const showMeshLabels = targets.length > 1;
  for (const target of targets) {
    graph.appendChild(createMaterialGraph(target, showMeshLabels));
  }
  section.appendChild(graph);
  container.appendChild(section);
}
