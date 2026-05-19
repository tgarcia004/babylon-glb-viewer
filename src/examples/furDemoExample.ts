/**
 * Your GLB viewer with official Babylon FurMaterial (shell layers).
 */

import "@babylonjs/loaders/glTF";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

import { FurMaterial } from "@babylonjs/materials/fur";
import { applyFur, capFurQuality, FUR_DEFAULTS, type FurInstance, type FurSettings } from "../fur/configureFur";
import {
  buildFurDiffuseTexture,
  describeMaterialSurface,
  extractMaterialSurfaceFromMesh,
  needsOpacityMerge,
  surfaceCacheKey,
  type MaterialSurface,
} from "../material/extractMaterialSurface";
import { normalizeImportedGltfMaterials } from "../material/normalizeImportedMaterials";
import {
  collectRenderableMeshes,
  formatImportStatus,
  summarizeImport,
} from "../model/collectMeshes";
import {
  createStudioLightRig,
  STUDIO_LIGHT_DEFAULTS,
  type StudioLightingState,
} from "../lighting/studioLights";
import { wireStudioLightingPanel } from "../lighting/wireStudioPanel";
import { wireModelUpload } from "../ui/wireModelUpload";
import { initViewportEmptyState } from "../ui/viewportEmptyState";
import {
  applyViewerConstraints,
  computeMeshBounds,
  configureViewerCamera,
  frameMeshes,
} from "../viewer/configureCamera";
import { registerThemeScene } from "../ui/theme";
import {
  refreshViewportPerfIndicator,
  registerPerfMetricsProvider,
} from "../ui/viewportPerfIndicator";

/** Above this mesh count we assume Blender shell export — skip app fur by default. */
const BLENDER_SHELL_MESH_THRESHOLD = 8;

function setSubtreeVisible(root: AbstractMesh, visible: boolean): void {
  const stack: AbstractMesh[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    node.isVisible = visible;
    node.setEnabled(visible);
    const children = node.getChildMeshes(false);
    for (const child of children) {
      stack.push(child);
    }
  }
}

function createFabricAlbedo(scene: Scene, name: string): DynamicTexture {
  const tex = new DynamicTexture(name, { width: 256, height: 256 }, scene, false);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  const ctx = tex.getContext();
  const grad = ctx.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, "#6e584b");
  grad.addColorStop(1, "#9e8375");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  tex.update(true);
  return tex;
}

function pickPrimaryHullMesh(meshes: Mesh[]): Mesh {
  const candidates = meshes.filter((m) => !!m.geometry && m.getTotalVertices() > 0);
  if (candidates.length === 0) {
    throw new Error("Model has no mesh with geometry.");
  }
  const metric = (mesh: Mesh): number => mesh.geometry?.getTotalIndices() ?? mesh.getTotalVertices();
  candidates.sort((a, b) => metric(b) - metric(a));
  return candidates[0];
}

function bindRange(
  panel: HTMLElement,
  inputId: string,
  valId: string,
  format: (v: number) => string,
  onInput: (v: number) => void,
): void {
  const input = panel.querySelector<HTMLInputElement>(`#${inputId}`);
  const valEl = panel.querySelector<HTMLElement>(`#${valId}`);
  if (!input) return;
  const sync = () => {
    const v = parseFloat(input.value);
    if (valEl) valEl.textContent = format(v);
    onInput(v);
  };
  input.addEventListener("input", sync);
  sync();
}

function bindCheckbox(
  panel: HTMLElement,
  id: string,
  onChange: (on: boolean) => void,
  options?: { fireInitial?: boolean },
): void {
  const el = panel.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) return;
  const sync = () => onChange(el.checked);
  el.addEventListener("change", sync);
  if (options?.fireInitial !== false) {
    sync();
  }
}

interface LiveFur {
  enabled: boolean;
  settings: FurSettings;
}

export async function runFurDemo(canvas: HTMLCanvasElement, panel: HTMLElement | null = null): Promise<void> {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    adaptToDeviceRatio: false,
  });

  const scene = new Scene(engine);
  registerThemeScene(scene);

  const camera = new ArcRotateCamera("cam", -1.1, 1.05, 5, new Vector3(0, 0.45, 0), scene);
  configureViewerCamera(camera, canvas);

  const lightRig = createStudioLightRig(scene);
  const lighting: StudioLightingState = {
    key: { ...STUDIO_LIGHT_DEFAULTS.key },
    fill: { ...STUDIO_LIGHT_DEFAULTS.fill },
    rim: { ...STUDIO_LIGHT_DEFAULTS.rim },
    ambient: STUDIO_LIGHT_DEFAULTS.ambient,
  };

  const fabricTex = createFabricAlbedo(scene, "fabricAlbedo");

  let hullMesh: Mesh | null = null;
  let importedMeshes: AbstractMesh[] = [];
  let importRoots: AbstractMesh[] = [];
  let importedLooksLikeBlenderShells = false;
  let importedShellStack = false;
  let lastImportSummary: ReturnType<typeof summarizeImport> | null = null;

  const live: LiveFur = {
    enabled: false,
    settings: {
      shellLift: FUR_DEFAULTS.shellLift,
      stackDepth: FUR_DEFAULTS.stackDepth,
      furAngle: FUR_DEFAULTS.furAngle,
      furDensity: FUR_DEFAULTS.furDensity,
      furSpeed: FUR_DEFAULTS.furSpeed,
      furGravity: FUR_DEFAULTS.furGravity.clone(),
      quality: FUR_DEFAULTS.quality,
    },
  };

  let fur: FurInstance | null = null;
  let hullSurface: MaterialSurface | null = null;
  let rebuildGeneration = 0;
  const furDiffuseCache = new Map<string, BaseTexture>();
  const statusEl = panel?.querySelector<HTMLElement>("#fur-status");
  const statsEl = panel?.querySelector<HTMLElement>("#fur-stats");
  const regenBtn = panel?.querySelector<HTMLButtonElement>("#fur-rebuild");
  const fileNameEl = panel?.querySelector<HTMLElement>("#model-file-name");
  const furEnabledInput = panel?.querySelector<HTMLInputElement>("#fur-enabled");

  function currentPerfSnapshot() {
    let triangleCount = 0;
    let meshCount = 0;

    if (fur && live.enabled) {
      triangleCount = fur.triangleCount;
      meshCount = 1 + (fur.shells?.length ?? 0);
    } else if (importedMeshes.length > 0) {
      const active = importedMeshes.filter((m) => !m.isDisposed());
      meshCount = active.length;
      for (const m of active) {
        if (!(m instanceof Mesh)) continue;
        triangleCount += Math.floor((m.getIndices()?.length ?? 0) / 3);
      }
    } else {
      meshCount = 0;
      triangleCount = 0;
    }

    return {
      triangleCount,
      meshCount,
      furEnabled: live.enabled,
    };
  }

  registerPerfMetricsProvider(currentPerfSnapshot);

  function enableAllImportedMeshes(): void {
    for (const m of importedMeshes) {
      if (m.isDisposed()) continue;
      setSubtreeVisible(m, true);
    }
  }

  function captureDiffuseForFur(mesh: Mesh): { texture: BaseTexture; surface: MaterialSurface | null } {
    const mat = mesh.material;
    if (mat instanceof FurMaterial) {
      return { texture: fabricTex, surface: null };
    }
    const surface = extractMaterialSurfaceFromMesh(mat);
    if (!surface) {
      return { texture: fabricTex, surface: null };
    }
    const tex = surface.diffuseTexture ?? fabricTex;
    return { texture: tex, surface };
  }

  function applyLiveFurSettings(): void {
    if (!fur || !live.enabled) return;
    fur.update({
      shellLift: live.settings.shellLift,
      furAngle: live.settings.furAngle,
      stackDepth: live.settings.stackDepth,
      furDensity: live.settings.furDensity,
      furSpeed: live.settings.furSpeed,
      furGravity: live.settings.furGravity,
    });
  }

  function meshesForCameraFrame(): AbstractMesh[] {
    if (importedMeshes.length > 0) {
      if (!live.enabled || importedLooksLikeBlenderShells) {
        return importedMeshes.filter((m) => !m.isDisposed());
      }
      const list: AbstractMesh[] = hullMesh ? [hullMesh] : [];
      if (fur?.shells) {
        for (const shell of fur.shells) {
          if (!shell.isDisposed()) list.push(shell);
        }
      }
      return list;
    }
    return [];
  }

  function refreshCameraConstraints(): void {
    const bounds = computeMeshBounds(meshesForCameraFrame());
    if (bounds) applyViewerConstraints(camera, bounds);
  }

  function syncImportedMeshVisibility(): void {
    if (importedMeshes.length === 0) return;

    // Never hide Blender shell / geo-node exports — only optional trim for app fur on simple multi-part models.
    if (!live.enabled || importedShellStack || importedLooksLikeBlenderShells) {
      enableAllImportedMeshes();
      return;
    }

    for (const m of importedMeshes) {
      if (m.isDisposed()) continue;
      const show = m === hullMesh || m.parent === hullMesh;
      setSubtreeVisible(m, show);
    }
    if (hullMesh && !hullMesh.isDisposed()) {
      setSubtreeVisible(hullMesh, true);
    }
  }

  async function resolveFurDiffuse(
    mesh: Mesh,
    surface: MaterialSurface | null,
  ): Promise<{ texture: BaseTexture; bakedMask: boolean }> {
    const fallback = captureDiffuseForFur(mesh);
    if (!surface) {
      return { texture: fallback.texture, bakedMask: false };
    }

    const cacheKey = surfaceCacheKey(surface);
    const cached = furDiffuseCache.get(cacheKey);
    if (cached) {
      return { texture: cached, bakedMask: true };
    }

    const shouldBake = needsOpacityMerge(surface);

    if (shouldBake) {
      try {
        if (statusEl) statusEl.textContent = "Baking alpha mask for fur…";
        const merged = await buildFurDiffuseTexture(scene, surface, `furAlbedo_${cacheKey}`);
        if (merged && merged !== surface.diffuseTexture) {
          furDiffuseCache.set(cacheKey, merged);
          return { texture: merged, bakedMask: true };
        }
      } catch {
        /* fall through to albedo */
      }
    }

    const tex = surface.diffuseTexture ?? fallback.texture;
    return { texture: tex, bakedMask: false };
  }

  async function rebuildFur(): Promise<void> {
    const generation = ++rebuildGeneration;
    fur?.dispose();
    fur = null;

    if (!hullMesh) {
      if (statsEl) statsEl.textContent = "";
      if (statusEl) statusEl.textContent = "Load a GLB or glTF to preview fur.";
      refreshViewportPerfIndicator();
      return;
    }

    if (!live.enabled) {
      hullSurface = extractMaterialSurfaceFromMesh(hullMesh.material);
      syncImportedMeshVisibility();
      if (statsEl) statsEl.textContent = "Fur off — base material only.";
      if (statusEl) {
        const matNote = hullSurface ? describeMaterialSurface(hullSurface) : "";
        const importNote = lastImportSummary
          ? `${lastImportSummary.meshCount} meshes in file`
          : "";
        const base = matNote ? `Fur disabled · ${matNote}` : "Fur disabled.";
        statusEl.textContent = importNote ? `${base} · ${importNote}` : base;
      }
      refreshCameraConstraints();
      refreshViewportPerfIndicator();
      return;
    }

    const captured = captureDiffuseForFur(hullMesh);
    hullSurface = captured.surface;

    let texture = captured.texture;
    let bakedMask = false;
    try {
      const resolved = await resolveFurDiffuse(hullMesh, captured.surface);
      texture = resolved.texture;
      bakedMask = resolved.bakedMask;
    } catch {
      /* use captured.texture */
    }

    if (generation !== rebuildGeneration) {
      return;
    }

    const effectiveQuality = capFurQuality(hullMesh, live.settings.quality);
    fur = applyFur(
      hullMesh,
      texture,
      { ...live.settings, quality: effectiveQuality },
      captured.surface,
      bakedMask,
    );
    syncImportedMeshVisibility();

    if (generation !== rebuildGeneration) {
      fur.dispose();
      fur = null;
      return;
    }

    const shellNote = importedLooksLikeBlenderShells ? " · hull only (multi-mesh GLB)" : "";
    if (statsEl) {
      const capped = effectiveQuality !== live.settings.quality ? ` (capped to ${effectiveQuality})` : "";
      statsEl.textContent = `${fur.shells.length} shells · ${fur.triangleCount.toLocaleString()} tris${capped}`;
    }
    if (statusEl) {
      const matNote = captured.surface ? describeMaterialSurface(captured.surface) : "";
      statusEl.textContent = `Fur on your model${matNote ? ` · ${matNote}` : ""}${shellNote}`;
    }
    refreshCameraConstraints();
    refreshViewportPerfIndicator();
  }

  async function loadGlb(file: File): Promise<void> {
    if (!file.size) return;
    const ext = file.name.toLowerCase().endsWith(".gltf") ? ".gltf" : ".glb";
    if (statusEl) statusEl.textContent = "Loading model…";

    const imported = await ImportMeshAsync(file, scene, {
      pluginExtension: ext,
      name: file.name,
      pluginOptions: { gltf: { compileMaterials: true, skipMaterials: false, useSRGBBuffers: true } },
    });

    fur?.dispose();
    fur = null;
    for (const m of importRoots) {
      if (!m.isDisposed()) m.dispose(false, true);
    }
    importRoots = imported.meshes.slice();
    const renderMeshes = collectRenderableMeshes(importRoots);
    importedMeshes = renderMeshes;
    lastImportSummary = summarizeImport(renderMeshes);

    hullMesh = pickPrimaryHullMesh(renderMeshes);
    viewportEmpty.setVisible(false);
    importedLooksLikeBlenderShells = renderMeshes.length > BLENDER_SHELL_MESH_THRESHOLD;
    importedShellStack = lastImportSummary.looksLikeShellStack;

    normalizeImportedGltfMaterials(renderMeshes, { shellStack: importedShellStack });

    live.enabled = false;
    if (furEnabledInput) furEnabledInput.checked = false;

    if (fileNameEl) fileNameEl.textContent = file.name;
    enableAllImportedMeshes();
    await rebuildFur();

    if (statusEl && lastImportSummary) {
      statusEl.textContent = formatImportStatus(lastImportSummary, file.name);
    }
    frameMeshes(camera, meshesForCameraFrame());
    refreshViewportPerfIndicator();
  }

  const viewportEmpty = initViewportEmptyState((file) => void loadGlb(file));
  viewportEmpty.setVisible(true);

  if (panel) {
    wireStudioLightingPanel(panel, scene, lightRig, lighting);

    bindCheckbox(
      panel,
      "fur-enabled",
      (on) => {
        live.enabled = on;
        if (furEnabledInput) furEnabledInput.checked = on;
        void rebuildFur();
      },
      { fireInitial: false },
    );
    bindRange(panel, "fur-quality", "fur-quality-val", (v) => String(Math.round(v)), (v) => {
      live.settings.quality = Math.round(v);
      if (live.enabled) void rebuildFur();
    });
    bindRange(panel, "fur-length", "fur-length-val", (v) => v.toFixed(3), (v) => {
      live.settings.shellLift = v;
      applyLiveFurSettings();
    });
    bindRange(panel, "fur-angle", "fur-angle-val", (v) => v.toFixed(2), (v) => {
      live.settings.furAngle = v;
      applyLiveFurSettings();
    });
    bindRange(panel, "fur-spacing", "fur-spacing-val", (v) => v.toFixed(2), (v) => {
      live.settings.stackDepth = v;
      applyLiveFurSettings();
    });
    bindRange(panel, "fur-density", "fur-density-val", (v) => String(Math.round(v)), (v) => {
      live.settings.furDensity = v;
      applyLiveFurSettings();
    });
    bindRange(panel, "fur-speed", "fur-speed-val", (v) => String(Math.round(v)), (v) => {
      live.settings.furSpeed = v;
      applyLiveFurSettings();
    });
    bindRange(panel, "fur-gravity-y", "fur-gravity-y-val", (v) => v.toFixed(2), (v) => {
      live.settings.furGravity.y = v;
      applyLiveFurSettings();
    });

    regenBtn?.addEventListener("click", () => void rebuildFur());
    wireModelUpload(panel, (file) => void loadGlb(file));
  }

  if (furEnabledInput) furEnabledInput.checked = false;
  if (statusEl) statusEl.textContent = "Load a GLB or glTF to preview fur.";
  refreshViewportPerfIndicator();

  const resetViewBtn = document.getElementById("viewer-reset");
  resetViewBtn?.addEventListener("click", () => {
    frameMeshes(camera, meshesForCameraFrame());
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
