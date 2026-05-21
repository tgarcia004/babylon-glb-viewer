import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Material } from "@babylonjs/core/Materials/material";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Node } from "@babylonjs/core/node";

export interface MaterialLayoutNode {
  key: string;
  label: string;
  value?: string;
  children: MaterialLayoutNode[];
}

function leaf(key: string, label: string, value?: string): MaterialLayoutNode {
  return { key, label, value, children: [] };
}

function branch(key: string, label: string, value: string | undefined, children: MaterialLayoutNode[]): MaterialLayoutNode {
  return { key, label, value, children };
}

function transparencyLabel(mode: number): string {
  switch (mode) {
    case Material.MATERIAL_ALPHATEST:
      return "Alpha test";
    case Material.MATERIAL_ALPHABLEND:
      return "Alpha blend";
    case Material.MATERIAL_ALPHATESTANDBLEND:
      return "Alpha test + blend";
    case Material.MATERIAL_OPAQUE:
    default:
      return mode === Material.MATERIAL_OPAQUE ? "Opaque" : `Mode ${mode}`;
  }
}

function colorHex(c: Color3): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function textureInfo(tex: BaseTexture | null, slotKey: string, slotLabel: string): MaterialLayoutNode {
  if (!tex) {
    return leaf(slotKey, slotLabel, "—");
  }
  const size = tex.getSize();
  const name = tex.name || "(unnamed)";
  const children: MaterialLayoutNode[] = [
    leaf(`${slotKey}-name`, "Texture", name),
    leaf(`${slotKey}-size`, "Size", `${size.width} × ${size.height}`),
  ];
  if (tex instanceof Texture) {
    if (tex.hasAlpha) {
      children.push(leaf(`${slotKey}-alpha`, "Alpha channel", "Yes"));
    }
    children.push(leaf(`${slotKey}-uv`, "UV set", String(tex.coordinatesIndex)));
  }
  return branch(slotKey, slotLabel, name, children);
}

function buildPbrLayout(mat: PBRMaterial): MaterialLayoutNode {
  const slots: MaterialLayoutNode[] = [
    textureInfo(mat.albedoTexture, "albedo", "Albedo / base color"),
    leaf("albedo-color", "Base color", colorHex(mat.albedoColor)),
    textureInfo(mat.metallicTexture, "metallic-roughness", "Metallic / roughness"),
    textureInfo(mat.reflectivityTexture, "reflectivity", "Reflectivity"),
    textureInfo(mat.metallicReflectanceTexture, "metallic-reflectance", "Metallic reflectance"),
    textureInfo(mat.bumpTexture, "normal", "Normal"),
    textureInfo(mat.emissiveTexture, "emissive", "Emissive"),
    leaf("emissive-color", "Emissive color", colorHex(mat.emissiveColor)),
    textureInfo(mat.ambientTexture, "occlusion", "Occlusion / ambient"),
    textureInfo(mat.opacityTexture, "opacity", "Opacity mask"),
    textureInfo(mat.lightmapTexture, "lightmap", "Lightmap"),
  ];

  const props: MaterialLayoutNode[] = [
    leaf("alpha", "Alpha", String(mat.alpha)),
    leaf("transparency", "Transparency", transparencyLabel(mat.transparencyMode ?? Material.MATERIAL_OPAQUE)),
    leaf("alpha-cutoff", "Alpha cutoff", String(mat.alphaCutOff)),
    leaf("metallic", "Metallic", String(mat.metallic)),
    leaf("roughness", "Roughness", String(mat.roughness)),
    leaf("two-sided", "Two-sided", mat.twoSidedLighting ? "Yes" : "No"),
    leaf("back-face-cull", "Back-face culling", mat.backFaceCulling ? "On" : "Off"),
  ];
  if (mat.useAlphaFromAlbedoTexture) {
    props.push(leaf("alpha-from-albedo", "Alpha from albedo", "Yes"));
  }

  slots.push(branch("properties", "Properties", undefined, props));

  return branch("material", mat.name || "PBRMaterial", mat.getClassName(), slots);
}

function buildStandardLayout(mat: StandardMaterial): MaterialLayoutNode {
  const slots: MaterialLayoutNode[] = [
    textureInfo(mat.diffuseTexture, "diffuse", "Diffuse"),
    leaf("diffuse-color", "Diffuse color", colorHex(mat.diffuseColor)),
    textureInfo(mat.specularTexture, "specular", "Specular"),
    textureInfo(mat.bumpTexture, "bump", "Bump / normal"),
    textureInfo(mat.emissiveTexture, "emissive", "Emissive"),
    textureInfo(mat.ambientTexture, "ambient", "Ambient"),
    textureInfo(mat.opacityTexture, "opacity", "Opacity"),
    branch("properties", "Properties", undefined, [
      leaf("alpha", "Alpha", String(mat.alpha)),
      leaf("transparency", "Transparency", transparencyLabel(mat.transparencyMode ?? Material.MATERIAL_OPAQUE)),
      leaf("specular-power", "Specular power", String(mat.specularPower)),
    ]),
  ];
  return branch("material", mat.name || "StandardMaterial", mat.getClassName(), slots);
}

function buildFurLayout(mat: Material): MaterialLayoutNode {
  const m = mat as Material & {
    diffuseTexture?: BaseTexture;
    heightTexture?: BaseTexture;
    furTexture?: BaseTexture;
    diffuseColor?: Color3;
    furLength?: number;
    furAngle?: number;
    furDensity?: number;
    furSpeed?: number;
  };
  const slots: MaterialLayoutNode[] = [
    textureInfo(m.diffuseTexture ?? null, "diffuse", "Diffuse / albedo"),
    textureInfo(m.heightTexture ?? null, "fur-mask", "Fur mask (0–1)"),
    textureInfo(m.furTexture ?? null, "fur", "Fur noise / strand mask"),
  ];
  if (m.diffuseColor) {
    slots.push(leaf("diffuse-color", "Diffuse color", colorHex(m.diffuseColor)));
  }
  const props: MaterialLayoutNode[] = [];
  if (m.furLength != null) props.push(leaf("fur-length", "Fur length", String(m.furLength)));
  if (m.furAngle != null) props.push(leaf("fur-angle", "Fur angle", String(m.furAngle)));
  if (m.furDensity != null) props.push(leaf("fur-density", "Fur density", String(m.furDensity)));
  if (m.furSpeed != null) props.push(leaf("fur-speed", "Fur speed", String(m.furSpeed)));
  if (props.length) {
    slots.push(branch("properties", "Properties", undefined, props));
  }
  return branch("material", mat.name || "FurMaterial", "FurMaterial", slots);
}

function buildMaterialLayout(mat: Material): MaterialLayoutNode {
  if (mat instanceof PBRMaterial) {
    return buildPbrLayout(mat);
  }
  if (mat instanceof StandardMaterial) {
    return buildStandardLayout(mat);
  }
  if (mat.getClassName() === "FurMaterial") {
    return buildFurLayout(mat);
  }
  if (mat instanceof MultiMaterial) {
    const subs = mat.subMaterials.map((sub, i) => {
      if (!sub) {
        return leaf(`sub-${i}`, `Slot ${i}`, "—");
      }
      const child = buildMaterialLayout(sub as Material);
      return branch(`sub-${i}`, `Slot ${i}`, sub.name || sub.getClassName(), [child]);
    });
    return branch("material", mat.name || "MultiMaterial", `MultiMaterial · ${mat.subMaterials.length} slots`, subs);
  }
  return branch("material", mat.name || "Material", mat.getClassName(), []);
}

function collectRenderableMeshes(node: Node): AbstractMesh[] {
  const found: AbstractMesh[] = [];
  const stack: Node[] = [node];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current instanceof AbstractMesh && current.getTotalVertices() > 0) {
      found.push(current);
    }
    for (const child of current.getChildren(() => true, false)) {
      stack.push(child);
    }
  }
  return found;
}

function layoutForMesh(mesh: AbstractMesh): MaterialLayoutNode {
  const mat = mesh.material;
  if (!mat) {
    return leaf(`mesh-${mesh.uniqueId}`, mesh.name || "Mesh", "No material");
  }
  if (mat instanceof MultiMaterial && mesh instanceof Mesh && mesh.subMeshes.length > 1) {
    const subNodes: MaterialLayoutNode[] = [];
    mesh.subMeshes.forEach((sub, i) => {
      const index = sub.materialIndex ?? 0;
      const subMat = mat.subMaterials[index] as Material | null;
      const label = `Submesh ${i}`;
      if (!subMat) {
        subNodes.push(leaf(`sm-${i}`, label, "—"));
        return;
      }
      subNodes.push(branch(`sm-${i}`, label, `Material index ${index}`, [buildMaterialLayout(subMat)]));
    });
    return branch(`mesh-${mesh.uniqueId}`, mesh.name || "Mesh", "MultiMaterial", subNodes);
  }
  return branch(`mesh-${mesh.uniqueId}`, mesh.name || "Mesh", undefined, [buildMaterialLayout(mat)]);
}

/** Material node tree for the Edit Object selection panel. */
export function buildMaterialLayoutForNode(node: Node): MaterialLayoutNode | null {
  if (node instanceof AbstractMesh && node.getTotalVertices() > 0) {
    return layoutForMesh(node);
  }

  const meshes = collectRenderableMeshes(node);
  if (meshes.length === 0) {
    return null;
  }
  if (meshes.length === 1) {
    return layoutForMesh(meshes[0]);
  }

  return branch(
    "materials-root",
    "Materials",
    `${meshes.length} meshes`,
    meshes.map((m) => layoutForMesh(m)),
  );
}
