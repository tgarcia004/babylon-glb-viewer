import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { GetTextureDataAsync } from "@babylonjs/core/Misc/textureTools";
import type { Node } from "@babylonjs/core/node";
import { FurMaterial } from "@babylonjs/materials/fur";

import {
  getMaterialEditTargets,
  isEditableFur,
  isEditablePbr,
  type MaterialEditTarget,
} from "../material/materialEditTargets";
import type { FurInspectorSlotId } from "../fur/furInspectorDefaults";
import {
  clampFurSpeed,
  furSpeedToUiPercent,
  uiPercentToFurSpeed,
} from "../fur/configureFur";
import {
  applyUniversalMaterialUv,
  collectMaterialTextures,
  DEFAULT_TEXTURE_UV,
  readUniversalMaterialUv,
  type TextureUvState,
} from "../material/materialUv";
import { getViewerBridge } from "../viewer/viewerBridge";

type InspectorRefresh = () => void;

interface TextureSlotDef {
  id: string;
  label: string;
  getTexture: (mat: PBRMaterial) => BaseTexture | null;
  setTexture: (mat: PBRMaterial, tex: Texture | null) => void;
}

interface FurTextureSlotDef {
  id: string;
  label: string;
  /** Short note shown on the texture node. */
  role?: string;
  getTexture: (mat: FurMaterial) => BaseTexture | null;
  setTexture: (mat: FurMaterial, tex: Texture) => void;
  allowReplace: boolean;
}

const FUR_TEXTURE_SLOTS: FurTextureSlotDef[] = [
  {
    id: "diffuse",
    label: "Diffuse / albedo",
    getTexture: (m) => m.diffuseTexture,
    setTexture: (m, t) => {
      m.diffuseTexture = t;
    },
    allowReplace: true,
  },
  {
    id: "fur-mask",
    label: "Fur mask",
    role: "Placement & thickness · grayscale 0–1",
    getTexture: (m) => m.heightTexture,
    setTexture: (m, t) => {
      m.heightTexture = t as FurMaterial["heightTexture"];
    },
    allowReplace: true,
  },
  {
    id: "fur-noise",
    label: "Fur noise",
    role: "Strand pattern · A = strands, G = shells",
    getTexture: (m) => m.furTexture,
    setTexture: (m, t) => {
      m.furTexture = t as FurMaterial["furTexture"];
    },
    allowReplace: true,
  },
];

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

function syncFurMaterial(mat: FurMaterial): void {
  markMaterialDirty(mat);
  getViewerBridge()?.syncFurMaterials();
}

/** Keep newly assigned maps on the same UV transform as the rest of the material. */
function syncMaterialTextureUv(mat: Material): void {
  applyUniversalMaterialUv(mat, readUniversalMaterialUv(mat));
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

function appendGraphConnector(parent: HTMLElement, extraClass = ""): void {
  const connector = document.createElement("div");
  connector.className = extraClass ? `mat-graph-connector ${extraClass}` : "mat-graph-connector";
  connector.setAttribute("aria-hidden", "true");
  parent.appendChild(connector);
}

/** Texture inputs wired into the material root (node graph layout). */
function buildTextureNodeGraph(textureNodes: HTMLElement[]): HTMLElement {
  const graph = document.createElement("div");
  graph.className = "mat-graph";

  const bus = document.createElement("div");
  bus.className = "mat-graph-bus";
  for (const node of textureNodes) {
    const arm = document.createElement("div");
    arm.className = "mat-graph-arm";
    const wire = document.createElement("div");
    wire.className = "mat-graph-wire";
    wire.setAttribute("aria-hidden", "true");
    arm.append(wire, node);
    bus.appendChild(arm);
  }
  graph.appendChild(bus);
  return graph;
}

function createFurDefaultButton(slotId: FurInspectorSlotId, onRestored: InspectorRefresh): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mat-slot-btn mat-slot-btn--ghost";
  btn.textContent = "Default";
  const bridge = getViewerBridge();
  btn.disabled = !bridge?.canRestoreFurSlot(slotId);
  btn.title = btn.disabled ? "No default saved for this slot" : "Restore the texture from when fur was enabled";
  btn.addEventListener("click", () => {
    if (!getViewerBridge()?.restoreFurInspectorSlot(slotId)) return;
    onRestored();
  });
  return btn;
}

function createFurTextureNode(
  mat: FurMaterial,
  slot: FurTextureSlotDef,
  onRestored: InspectorRefresh,
): HTMLElement {
  const node = document.createElement("div");
  node.className = "mat-node mat-node--texture";
  if (slot.id === "fur-mask") {
    node.classList.add("mat-node--fur-mask");
  }
  node.dataset.slot = slot.id;

  const typeBadge = document.createElement("span");
  typeBadge.className = "mat-node-badge";
  typeBadge.textContent = "Texture";

  const label = document.createElement("span");
  label.className = "mat-node-name";
  label.textContent = slot.label;

  const head = document.createElement("div");
  head.className = "mat-node-head";
  if (slot.role) {
    head.title = slot.role;
  }
  head.append(typeBadge, label);
  node.appendChild(head);

  const body = document.createElement("div");
  body.className = "mat-node-body mat-slot-card";
  body.dataset.slot = slot.id;

  const thumb = document.createElement("div");
  thumb.className = "mat-slot-thumb";
  void paintTextureThumb(thumb, slot.getTexture(mat));

  const texName = document.createElement("span");
  texName.className = "mat-slot-texname";
  const current = slot.getTexture(mat);
  texName.textContent = current?.name || (slot.id === "fur-noise" ? "Procedural" : "—");
  texName.title = current?.name || slot.role || "";

  const actions = document.createElement("div");
  actions.className = "mat-slot-actions";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*,.png,.jpg,.jpeg,.webp";
  fileInput.hidden = true;

  const replaceBtn = document.createElement("button");
  replaceBtn.type = "button";
  replaceBtn.className = "mat-slot-btn";
  replaceBtn.textContent = "Replace";

  replaceBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;

    const scene = mat.getScene();
    if (!scene) return;

    const bridge = getViewerBridge();
    const objectUrl = URL.createObjectURL(file);
    const tex = new Texture(
      objectUrl,
      scene,
      false,
      false,
      Texture.TRILINEAR_SAMPLINGMODE,
      () => URL.revokeObjectURL(objectUrl),
      () => URL.revokeObjectURL(objectUrl),
    );
    tex.name = file.name;
    if (!file.type.includes("png")) {
      tex.getAlphaFromRGB = true;
    }

    if (slot.id === "fur-mask" && bridge) {
      replaceBtn.disabled = true;
      texName.textContent = "Applying mask…";
      void bridge
        .applyFurDensityMask(tex)
        .then(() => {
          texName.textContent = file.name;
          syncMaterialTextureUv(mat);
          void paintTextureThumb(thumb, tex);
          syncFurMaterial(mat);
          onRestored();
        })
        .catch(() => {
          texName.textContent = "Mask failed";
        })
        .finally(() => {
          replaceBtn.disabled = false;
        });
      return;
    }

    slot.setTexture(mat, tex);
    syncMaterialTextureUv(mat);
    syncFurMaterial(mat);
    texName.textContent = file.name;
    void paintTextureThumb(thumb, tex);
  });

  actions.append(replaceBtn, createFurDefaultButton(slot.id as FurInspectorSlotId, onRestored));
  body.append(thumb, texName, actions, fileInput);
  node.appendChild(body);
  return node;
}

function createPbrTextureNode(mat: PBRMaterial, slot: TextureSlotDef): HTMLElement {
  const node = document.createElement("div");
  node.className = "mat-node mat-node--texture";
  node.dataset.slot = slot.id;

  const typeBadge = document.createElement("span");
  typeBadge.className = "mat-node-badge";
  typeBadge.textContent = "Texture";

  const label = document.createElement("span");
  label.className = "mat-node-name";
  label.textContent = slot.label;

  const head = document.createElement("div");
  head.className = "mat-node-head";
  head.append(typeBadge, label);
  node.appendChild(head);

  const body = document.createElement("div");
  body.className = "mat-node-body mat-slot-card";
  body.dataset.slot = slot.id;

  const thumb = document.createElement("div");
  thumb.className = "mat-slot-thumb";
  void paintTextureThumb(thumb, slot.getTexture(mat));

  const texName = document.createElement("span");
  texName.className = "mat-slot-texname";
  const current = slot.getTexture(mat);
  texName.textContent = current?.name || "—";
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
    syncMaterialTextureUv(mat);
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
  body.append(thumb, texName, actions, fileInput);
  node.appendChild(body);
  return node;
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

interface ScalarControlHandle {
  row: HTMLElement;
  setValue: (value: number) => void;
}

function createScalarControlHandle(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
): ScalarControlHandle {
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
  return {
    row,
    setValue: (v: number) => {
      input.value = String(v);
      val.textContent = format(v);
    },
  };
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

function createFurPropertyPanel(mat: FurMaterial, onRestored: InspectorRefresh): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "mat-props-panel";

  const resetRow = document.createElement("div");
  resetRow.className = "mat-fur-defaults-row";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "mat-slot-btn";
  resetBtn.textContent = "Reset properties to default";
  resetBtn.disabled = !getViewerBridge()?.getFurInspectorDefaults();
  resetBtn.addEventListener("click", () => {
    getViewerBridge()?.restoreFurInspectorProperties();
    onRestored();
  });
  resetRow.appendChild(resetBtn);
  panel.appendChild(resetRow);

  const colorRow = document.createElement("div");
  colorRow.className = "mat-prop-row";
  const colorLbl = document.createElement("label");
  colorLbl.className = "mat-prop-label";
  colorLbl.textContent = "Diffuse color";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.className = "mat-prop-color";
  colorInput.value = colorToHex(mat.diffuseColor);
  colorInput.addEventListener("input", () => {
    mat.diffuseColor = hexToColor3(colorInput.value);
    syncFurMaterial(mat);
  });
  colorRow.append(colorLbl, colorInput);

  const bridge = getViewerBridge();

  panel.append(
    colorRow,
    ...(bridge
      ? [
          createScalarControl("Fur length", bridge.getFurShellLift(), 0, 1.5, 0.001, (v) => v.toFixed(3), (v) => {
            bridge.setFurShellLift(v);
            syncFurMaterial(mat);
          }),
          createScalarControl("Stack depth", bridge.getFurStackDepth(), 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
            bridge.setFurStackDepth(v);
            syncFurMaterial(mat);
          }),
        ]
      : []),
    createScalarControl("Fur angle", mat.furAngle, 0, Math.PI, 0.01, (v) => v.toFixed(2), (v) => {
      mat.furAngle = v;
      syncFurMaterial(mat);
    }),
    createScalarControl("Fur density", mat.furDensity, 0, 80, 1, (v) => String(Math.round(v)), (v) => {
      mat.furDensity = v;
      syncFurMaterial(mat);
    }),
    createScalarControl(
      "Animation speed",
      furSpeedToUiPercent(mat.furSpeed),
      0,
      100,
      1,
      (v) => `${Math.round(v)}%`,
      (uiPercent) => {
        const next = uiPercentToFurSpeed(uiPercent);
        if (next !== mat.furSpeed) {
          mat.furTime = 0;
        }
        mat.furSpeed = next;
        mat.updateFur();
        syncFurMaterial(mat);
      },
    ),
    createScalarControl("Gravity Y", mat.furGravity.y, -2, 2, 0.05, (v) => v.toFixed(2), (v) => {
      mat.furGravity = new Vector3(mat.furGravity.x, v, mat.furGravity.z);
      syncFurMaterial(mat);
    }),
    createScalarControl("Alpha", mat.alpha, 0, 1, 0.01, (v) => v.toFixed(2), (v) => {
      mat.alpha = v;
      syncFurMaterial(mat);
    }),
  );

  return panel;
}

function createUniversalUvPanel(mat: Material, onDirty: () => void): HTMLElement {
  const wrap = document.createElement("details");
  wrap.className = "mat-uv-advanced";
  wrap.open = false;

  const summary = document.createElement("summary");
  summary.className = "mat-uv-advanced-summary";
  summary.textContent = "Advanced UV";
  wrap.appendChild(summary);

  const texCount = collectMaterialTextures(mat).length;
  const hint = document.createElement("p");
  hint.className = "hint mat-uv-advanced-hint";
  hint.textContent =
    texCount > 0
      ? `One transform for all ${texCount} texture${texCount === 1 ? "" : "s"} on this material.`
      : "One transform for every texture on this material (applies when maps are assigned).";
  wrap.appendChild(hint);

  const defaultRow = document.createElement("div");
  defaultRow.className = "mat-uv-defaults-row";
  const defaultBtn = document.createElement("button");
  defaultBtn.type = "button";
  defaultBtn.className = "mat-slot-btn mat-slot-btn--ghost";
  defaultBtn.textContent = "Default UV";
  defaultBtn.title = "Reset offset, scale, rotation, wrap, and UV set to defaults on all textures";
  wrap.appendChild(defaultRow);

  const panel = document.createElement("div");
  panel.className = "mat-uv-panel";

  const uv: TextureUvState = readUniversalMaterialUv(mat);

  const applyUv = (next: Partial<TextureUvState>): void => {
    Object.assign(uv, next);
    applyUniversalMaterialUv(mat, uv);
    onDirty();
  };

  const uOffsetCtrl = createScalarControlHandle("U offset", uv.uOffset, -2, 2, 0.01, (v) => v.toFixed(2), (v) => {
    applyUv({ uOffset: v });
  });
  const vOffsetCtrl = createScalarControlHandle("V offset", uv.vOffset, -2, 2, 0.01, (v) => v.toFixed(2), (v) => {
    applyUv({ vOffset: v });
  });
  const uScaleCtrl = createScalarControlHandle("U scale", uv.uScale, 0.01, 8, 0.01, (v) => v.toFixed(2), (v) => {
    applyUv({ uScale: v });
  });
  const vScaleCtrl = createScalarControlHandle("V scale", uv.vScale, 0.01, 8, 0.01, (v) => v.toFixed(2), (v) => {
    applyUv({ vScale: v });
  });
  const rotationCtrl = createScalarControlHandle(
    "Rotation",
    uv.wAng,
    -Math.PI,
    Math.PI,
    0.01,
    (v) => v.toFixed(2),
    (v) => {
      applyUv({ wAng: v });
    },
  );

  panel.append(
    uOffsetCtrl.row,
    vOffsetCtrl.row,
    uScaleCtrl.row,
    vScaleCtrl.row,
    rotationCtrl.row,
  );

  const wrapRow = document.createElement("div");
  wrapRow.className = "mat-prop-row";
  const wrapLbl = document.createElement("label");
  wrapLbl.className = "mat-prop-label";
  wrapLbl.textContent = "Wrap";
  const wrapSelect = document.createElement("select");
  wrapSelect.className = "mat-prop-select";
  wrapSelect.innerHTML = `
    <option value="${Texture.CLAMP_ADDRESSMODE}">Clamp</option>
    <option value="${Texture.WRAP_ADDRESSMODE}">Repeat</option>
    <option value="${Texture.MIRROR_ADDRESSMODE}">Mirror</option>
  `;
  wrapSelect.value = String(uv.wrapU);
  wrapSelect.addEventListener("change", () => {
    const mode = parseInt(wrapSelect.value, 10);
    applyUv({ wrapU: mode, wrapV: mode });
  });
  wrapRow.append(wrapLbl, wrapSelect);
  panel.appendChild(wrapRow);

  const uvSetRow = document.createElement("div");
  uvSetRow.className = "mat-prop-row";
  const uvLbl = document.createElement("label");
  uvLbl.className = "mat-prop-label";
  uvLbl.textContent = "UV set";
  const uvSelect = document.createElement("select");
  uvSelect.className = "mat-prop-select";
  uvSelect.innerHTML = `
    <option value="0">UV0</option>
    <option value="1">UV1</option>
  `;
  uvSelect.value = String(uv.coordinatesIndex);
  uvSelect.addEventListener("change", () => {
    applyUv({ coordinatesIndex: parseInt(uvSelect.value, 10) });
  });
  uvSetRow.append(uvLbl, uvSelect);
  panel.appendChild(uvSetRow);

  defaultBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    Object.assign(uv, { ...DEFAULT_TEXTURE_UV });
    applyUniversalMaterialUv(mat, uv);
    uOffsetCtrl.setValue(uv.uOffset);
    vOffsetCtrl.setValue(uv.vOffset);
    uScaleCtrl.setValue(uv.uScale);
    vScaleCtrl.setValue(uv.vScale);
    rotationCtrl.setValue(uv.wAng);
    wrapSelect.value = String(uv.wrapU);
    uvSelect.value = String(uv.coordinatesIndex);
    onDirty();
  });
  defaultRow.appendChild(defaultBtn);

  wrap.appendChild(panel);
  return wrap;
}

function createMaterialGraph(
  target: MaterialEditTarget,
  showMeshLabel: boolean,
  onFurRestored: InspectorRefresh,
): HTMLElement {
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

  const graphShell = document.createElement("div");
  graphShell.className = "mat-graph-shell";
  graphShell.appendChild(root);
  appendGraphConnector(graphShell, "mat-graph-connector--root");

  if (isEditableFur(material)) {
    const refreshFurUi = () => {
      onFurRestored();
    };

    const textureNodes = FUR_TEXTURE_SLOTS.map((slot) =>
      createFurTextureNode(material, slot, refreshFurUi),
    );
    graphShell.appendChild(buildTextureNodeGraph(textureNodes));

    const propsWrap = document.createElement("div");
    propsWrap.className = "mat-graph-props";
    const propsTitle = document.createElement("p");
    propsTitle.className = "mat-graph-slots-title";
    propsTitle.textContent = "Fur properties";
    const furNote = document.createElement("p");
    furNote.className = "hint mat-inspector-hint";
    furNote.textContent =
      "Mask texture: 0–1 grayscale for where/how thick. Fur length sets overall shell stack height.";
    propsWrap.append(
      propsTitle,
      furNote,
      createFurPropertyPanel(material, refreshFurUi),
      createUniversalUvPanel(material, () => syncFurMaterial(material)),
    );
    block.append(graphShell, propsWrap);
  } else if (isEditablePbr(material)) {
    const textureNodes = PBR_TEXTURE_SLOTS.map((slot) => createPbrTextureNode(material, slot));
    graphShell.appendChild(buildTextureNodeGraph(textureNodes));

    const propsWrap = document.createElement("div");
    propsWrap.className = "mat-graph-props";
    const propsTitle = document.createElement("p");
    propsTitle.className = "mat-graph-slots-title";
    propsTitle.textContent = "Material properties";
    propsWrap.append(
      propsTitle,
      createPbrPropertyPanel(material),
      createUniversalUvPanel(material, () => markMaterialDirty(material)),
    );
    block.append(graphShell, propsWrap);
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
  container.querySelector(".mat-inspector")?.remove();

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
  const refreshInspector = () => renderMaterialInspector(container, sceneNode);
  for (const target of targets) {
    graph.appendChild(createMaterialGraph(target, showMeshLabels, refreshInspector));
  }
  section.appendChild(graph);
  container.appendChild(section);
}
