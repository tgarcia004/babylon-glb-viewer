/**
 * Your GLB viewer with official Babylon FurMaterial (shell layers).
 */

import "@babylonjs/loaders/glTF";
import "@babylonjs/core/Layers/effectLayerSceneComponent";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";
import type { Node } from "@babylonjs/core/node";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

import { FurMaterial } from "@babylonjs/materials/fur";
import {
  applyFur,
  capFurQuality,
  clampFurSpeed,
  furSpeedForEngine,
  normalizeStoredFurSpeed,
  FUR_DEFAULTS,
  syncShellMaterials,
  type FurInstance,
  type FurSettings,
} from "../fur/configureFur";
import {
  applyFurDensityMask as applyFurDensityMaskToMaterial,
  computeMaskFurLength,
} from "../fur/furDensityMask";
import {
  captureFurEditorSnapshot,
  furEditorSnapshotFromInspectorDefaults,
  restoreFurEditorSnapshot,
  type FurEditorSnapshot,
} from "../fur/furEditorSnapshot";
import {
  canRestoreFurSlot,
  restoreFurProperties,
  restoreFurSlot,
  snapshotFurInspectorDefaults,
  type FurInspectorDefaults,
  type FurInspectorSlotId,
} from "../fur/furInspectorDefaults";
import {
  buildFurDiffuseTexture,
  describeMaterialSurface,
  extractMaterialSurfaceFromMesh,
  needsOpacityMerge,
  surfaceUsesAlbedoAlpha,
  surfaceCacheKey,
  type MaterialSurface,
} from "../material/extractMaterialSurface";
import {
  applyPbrMaterialProfile,
  applyPbrMaterialProfileToMaterial,
  cyclePbrProfile,
  getPbrMaterialProfile,
  normalizeImportedGltfMaterials,
  PBR_MATERIAL_PROFILES,
  profileIndex,
  type PbrMaterialProfileId,
} from "../material/normalizeImportedMaterials";
import {
  collectRenderableMeshes,
  formatImportStatus,
  summarizeImport,
} from "../model/collectMeshes";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import { importModelFile } from "../model/importModelFile";
import {
  createStudioLightRig,
  STUDIO_LIGHT_DEFAULTS,
  type StudioLightingState,
} from "../lighting/studioLights";
import { wireStudioLightingPanel } from "../lighting/wireStudioPanel";
import { registerModelFileHandlers } from "../ui/modelFileDrop";
import { wireModelUpload } from "../ui/wireModelUpload";
import { initViewportEmptyState } from "../ui/viewportEmptyState";
import {
  applyViewerConstraints,
  computeMeshBounds,
  configureViewerCamera,
  frameMeshes,
} from "../viewer/configureCamera";
import { registerThemeScene, type ViewerTheme } from "../ui/theme";
import { furSettingsFromSnapshot, type SceneSnapshotV1 } from "../scene/sceneSnapshot";
import { wireSceneSnapshotPanel } from "../ui/wireSceneSnapshot";
import {
  initObjectHierarchyPanel,
  notifyHierarchySelection,
  refreshHierarchySummary,
} from "../ui/objectHierarchyPanel";
import { emitViewerImportState, registerViewerBridge } from "../viewer/viewerBridge";
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

  const highlightLayer = new HighlightLayer("hierarchyHighlight", scene, {
    blurHorizontalSize: 0.35,
    blurVerticalSize: 0.35,
  });

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
  let hullPbrMaterial: PBRMaterial | null = null;
  let pbrProfileId: PbrMaterialProfileId = "furShell";
  let importedMeshes: AbstractMesh[] = [];
  let importRoots: AbstractMesh[] = [];
  let importContainer: AssetContainer | null = null;
  let loadGeneration = 0;
  let importedLooksLikeBlenderShells = false;
  let importedShellStack = false;
  let lastImportSummary: ReturnType<typeof summarizeImport> | null = null;
  let currentModelFileName: string | null = null;

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
  let furInspectorDefaults: FurInspectorDefaults | null = null;
  let furEditorSnapshot: FurEditorSnapshot | null = null;
  let furDensityMaskTexture: BaseTexture | null = null;
  let hullSurface: MaterialSurface | null = null;
  let rebuildGeneration = 0;
  const furDiffuseCache = new Map<string, BaseTexture>();
  const statusEl = panel?.querySelector<HTMLElement>("#fur-status");
  const statsEl = panel?.querySelector<HTMLElement>("#fur-stats");
  const fileNameEl = panel?.querySelector<HTMLElement>("#model-file-name");
  const furEnabledInput = panel?.querySelector<HTMLInputElement>("#fur-enabled");
  const viewportEmpty = initViewportEmptyState();
  viewportEmpty.setVisible(true);

  const onRejectedModel = (file: File): void => {
    const msg = `Not a GLB/glTF file: ${file.name}`;
    viewportEmpty.setStatus(msg);
    if (fileNameEl) fileNameEl.textContent = msg;
    if (statusEl) statusEl.textContent = msg;
  };

  const onModelFile = (file: File): void => {
    const label = file.name || "model";
    viewportEmpty.setStatus(`Loading ${label}…`);
    if (fileNameEl) fileNameEl.textContent = `Loading ${label}…`;
    if (statusEl) statusEl.textContent = "Loading model…";
    void loadGlb(file);
  };

  registerModelFileHandlers({ onFile: onModelFile, onRejected: onRejectedModel });
  wireModelUpload(onModelFile, onRejectedModel);

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
      return { texture: mat.diffuseTexture ?? fabricTex, surface: null };
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
    live.settings.furSpeed = clampFurSpeed(live.settings.furSpeed);
    fur.update({
      shellLift: live.settings.shellLift,
      furAngle: live.settings.furAngle,
      stackDepth: live.settings.stackDepth,
      furDensity: live.settings.furDensity,
      furSpeed: live.settings.furSpeed,
      furGravity: live.settings.furGravity,
    });
    if (fur.material.heightTexture) {
      fur.material.furLength = computeMaskFurLength(live.settings.shellLift);
      fur.material.updateFur();
    }
  }

  async function refreshFurMaskLength(): Promise<void> {
    if (!fur?.material.heightTexture) return;
    await applyFurDensityMaskToMaterial(scene, fur.material, fur.shells, fur.material.heightTexture, {
      shellLift: live.settings.shellLift,
      maskStrength: 1,
      rebakeNoise: false,
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
    const bakedMask =
      pbrProfileId === "albedoAlpha" ? surfaceUsesAlbedoAlpha(surface) : false;
    return { texture: tex, bakedMask };
  }

  function syncLiveSettingsFromFurMaterial(): void {
    if (!fur) return;
    live.settings.furAngle = fur.material.furAngle;
    live.settings.furDensity = fur.material.furDensity;
    live.settings.furSpeed = normalizeStoredFurSpeed(fur.material.furSpeed);
    live.settings.furGravity = fur.material.furGravity.clone();
  }

  async function rebuildFur(options?: { preserveMaterialState?: boolean }): Promise<void> {
    const generation = ++rebuildGeneration;
    const hadFurBeforeRebuild = !!fur;
    const preserveMaterialState = options?.preserveMaterialState ?? false;
    let preRebuildSnapshot: FurEditorSnapshot | null = null;

    if (fur) {
      if (!live.enabled) {
        furEditorSnapshot = captureFurEditorSnapshot(fur.material);
      } else if (preserveMaterialState) {
        preRebuildSnapshot = captureFurEditorSnapshot(fur.material);
      }
      if (fur.material.heightTexture) {
        furDensityMaskTexture = fur.material.heightTexture;
      }
      // Keep textures when disabling so furEditorSnapshot stays valid for re-enable.
      fur.dispose({ preserveTextures: true });
      fur = null;
    }

    if (!hullMesh) {
      if (statsEl) statsEl.textContent = "";
      if (statusEl) statusEl.textContent = "Load a GLB or glTF to preview fur.";
      refreshViewportPerfIndicator();
      return;
    }

    if (!live.enabled) {
      hullSurface = extractMaterialSurfaceFromMesh(hullPbrMaterial ?? hullMesh.material);
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
      pushImportState();
      return;
    }

    const surfaceForFur =
      hullSurface ?? extractMaterialSurfaceFromMesh(hullPbrMaterial ?? hullMesh.material);
    hullSurface = surfaceForFur;
    const captured = captureDiffuseForFur(hullMesh);

    let texture = captured.texture;
    let bakedMask = false;
    if (preRebuildSnapshot?.diffuseTexture) {
      texture = preRebuildSnapshot.diffuseTexture;
    } else {
      try {
        const resolved = await resolveFurDiffuse(hullMesh, surfaceForFur);
        texture = resolved.texture;
        bakedMask = resolved.bakedMask;
      } catch {
        /* use captured.texture */
      }
    }

    if (generation !== rebuildGeneration) {
      return;
    }

    const effectiveQuality = capFurQuality(hullMesh, live.settings.quality);
    if (effectiveQuality !== live.settings.quality) {
      live.settings.quality = effectiveQuality;
    }
    fur = applyFur(
      hullMesh,
      texture,
      { ...live.settings, quality: effectiveQuality },
      surfaceForFur,
      bakedMask,
    );
    syncImportedMeshVisibility();

    if (generation !== rebuildGeneration) {
      fur.dispose({ preserveTextures: true });
      fur = null;
      return;
    }

    if (preRebuildSnapshot) {
      restoreFurEditorSnapshot(fur.material, fur.shells, preRebuildSnapshot);
      applyLiveFurSettings();
      syncLiveSettingsFromFurMaterial();
    } else if (furEditorSnapshot) {
      restoreFurEditorSnapshot(fur.material, fur.shells, furEditorSnapshot);
      applyLiveFurSettings();
      syncLiveSettingsFromFurMaterial();
    } else {
      const autoMask = furDensityMaskTexture ?? hullPbrMaterial?.bumpTexture ?? null;
      if (autoMask) {
        furDensityMaskTexture = autoMask;
        await applyFurDensityMaskToMaterial(scene, fur.material, fur.shells, autoMask, {
          shellLift: live.settings.shellLift,
          maskStrength: 1,
        });
      }
    }

    if (!furInspectorDefaults) {
      furInspectorDefaults = snapshotFurInspectorDefaults(
        fur.material,
        fur.material.heightTexture ?? null,
        live.settings.shellLift,
        live.settings.stackDepth,
        live.settings.quality,
      );
    }

    const shellNote = importedLooksLikeBlenderShells ? " · hull only (multi-mesh GLB)" : "";
    if (statsEl) {
      const capped = effectiveQuality !== live.settings.quality ? ` (capped to ${effectiveQuality})` : "";
      statsEl.textContent = `${fur.shells.length} shells · ${fur.triangleCount.toLocaleString()} tris${capped}`;
    }
    if (statusEl) {
      const profile = getPbrMaterialProfile(pbrProfileId);
      const matNote = surfaceForFur ? describeMaterialSurface(surfaceForFur) : "";
      statusEl.textContent = `Fur on · ${profile.label}${matNote ? ` · ${matNote}` : ""}${shellNote}`;
    }
    refreshCameraConstraints();
    refreshViewportPerfIndicator();
    if (live.enabled && fur && hadFurBeforeRebuild) {
      refreshHierarchySummary();
    } else {
      pushImportState();
    }
  }

  function syncPbrProfileUi(): void {
    const profile = getPbrMaterialProfile(pbrProfileId);
    const labelEl = panel?.querySelector<HTMLElement>("#pbr-profile-label");
    const descEl = panel?.querySelector<HTMLElement>("#pbr-profile-desc");
    const indexEl = panel?.querySelector<HTMLElement>("#pbr-profile-index");
    if (labelEl) labelEl.textContent = profile.label;
    if (descEl) descEl.textContent = profile.description;
    if (indexEl) {
      indexEl.textContent = `${profileIndex(pbrProfileId) + 1} / ${PBR_MATERIAL_PROFILES.length}`;
    }
  }

  function refreshPbrProfile(): void {
    if (importedMeshes.length === 0) return;
    applyPbrMaterialProfile(importedMeshes, {
      profile: pbrProfileId,
      shellStack: importedShellStack,
    });
    if (hullPbrMaterial) {
      applyPbrMaterialProfileToMaterial(hullPbrMaterial, pbrProfileId, 0);
      hullSurface = extractMaterialSurfaceFromMesh(hullPbrMaterial);
    }
    furDiffuseCache.clear();
    scene.resetCachedMaterial();
    syncPbrProfileUi();
    if (live.enabled) {
      void rebuildFur();
    } else if (statusEl && hullSurface) {
      const profile = getPbrMaterialProfile(pbrProfileId);
      statusEl.textContent = `Fur off · ${profile.label} · ${describeMaterialSurface(hullSurface)}`;
    }
  }

  const hierarchyDisplayRoots = (): AbstractMesh[] => {
    const roots = importRoots.filter((m) => !m.isDisposed());
    if (live.enabled && fur && hullMesh && !hullMesh.isDisposed()) {
      return [hullMesh];
    }
    return roots;
  };

  const pushImportState = (): void => {
    emitViewerImportState({
      roots: hierarchyDisplayRoots(),
      fileName: currentModelFileName,
      furEnabled: live.enabled && !!fur,
    });
  };

  const findNodeByUniqueId = (uniqueId: number): Node | null => {
    return scene.getMeshByUniqueId(uniqueId) ?? scene.getTransformNodeByUniqueId(uniqueId);
  };

  const clearHierarchySelection = (): void => {
    highlightLayer.removeAllMeshes();
    notifyHierarchySelection(null);
  };

  const selectByUniqueId = (uniqueId: number): void => {
    clearHierarchySelection();
    const node = findNodeByUniqueId(uniqueId);
    if (!node) return;
    if (node instanceof Mesh && node.getTotalVertices() > 0) {
      highlightLayer.addMesh(node, Color3.FromHexString("#E8A84A"));
      frameMeshes(camera, [node]);
      refreshCameraConstraints();
    }
    notifyHierarchySelection(uniqueId);
  };

  registerViewerBridge({
    getImportState: () => ({
      roots: hierarchyDisplayRoots(),
      fileName: currentModelFileName,
      furEnabled: live.enabled && !!fur,
    }),
    getFurState: () => ({
      enabled: live.enabled && !!fur,
      hullUniqueId: hullMesh?.uniqueId ?? null,
      masterMaterial: fur?.material ?? null,
      shellCount: fur?.shells.length ?? 0,
    }),
    findNodeByUniqueId,
    selectByUniqueId,
    clearSelection: clearHierarchySelection,
    syncFurMaterials: () => {
      if (!fur) return;
      const m = fur.material;
      const speed = normalizeStoredFurSpeed(m.furSpeed);
      const engineSpeed = furSpeedForEngine(speed);
      if (engineSpeed !== m.furSpeed) {
        m.furSpeed = engineSpeed;
      }
      live.settings.furSpeed = speed;
      live.settings.furAngle = m.furAngle;
      live.settings.furDensity = m.furDensity;
      live.settings.furGravity = m.furGravity.clone();
      syncShellMaterials(fur.shells, m);
      m.updateFur();
      scene.resetCachedMaterial();
    },
    getFurInspectorDefaults: () => furInspectorDefaults,
    canRestoreFurSlot: (slotId: FurInspectorSlotId) => canRestoreFurSlot(furInspectorDefaults, slotId),
    getFurDensityMask: () => fur?.material?.heightTexture ?? null,
    applyFurDensityMask: async (mask) => {
      if (!fur || !hullMesh) return;
      furDensityMaskTexture = mask;
      await applyFurDensityMaskToMaterial(scene, fur.material, fur.shells, mask, {
        shellLift: live.settings.shellLift,
        maskStrength: 1,
        rebakeNoise: false,
      });
    },
    clearFurDensityMask: async () => {
      if (!fur) return;
      furDensityMaskTexture = null;
      await applyFurDensityMaskToMaterial(scene, fur.material, fur.shells, null, {
        shellLift: live.settings.shellLift,
        rebakeNoise: false,
      });
    },
    getFurShellLift: () => live.settings.shellLift,
    setFurShellLift: (value) => {
      live.settings.shellLift = value;
      applyLiveFurSettings();
    },
    getFurStackDepth: () => live.settings.stackDepth,
    setFurStackDepth: (value) => {
      live.settings.stackDepth = value;
      applyLiveFurSettings();
    },
    getFurQuality: () => live.settings.quality,
    setFurQuality: (value) => {
      const next = Math.round(Math.max(4, Math.min(32, value)));
      if (next === live.settings.quality) return;
      live.settings.quality = next;
      if (!live.enabled) return;
      const detail = document.getElementById("object-hierarchy-detail");
      const tree = document.getElementById("object-hierarchy-tree");
      const detailScroll = detail?.scrollTop ?? 0;
      const treeScroll = tree?.scrollTop ?? 0;
      void rebuildFur({ preserveMaterialState: true }).finally(() => {
        requestAnimationFrame(() => {
          if (detail) detail.scrollTop = detailScroll;
          if (tree) tree.scrollTop = treeScroll;
        });
      });
    },
    restoreFurInspectorSlot: (slotId: FurInspectorSlotId) => {
      if (!fur || !furInspectorDefaults) return false;
      if (slotId === "fur-mask") {
        furDensityMaskTexture = furInspectorDefaults.heightTexture;
      }
      return restoreFurSlot(
        scene,
        fur.material,
        fur.shells,
        furInspectorDefaults,
        slotId,
        live.settings.shellLift,
      );
    },
    restoreFurInspectorProperties: () => {
      if (!fur || !furInspectorDefaults) return;
      const defaults = furInspectorDefaults;
      const qualityChanged = live.settings.quality !== defaults.quality;
      live.settings.shellLift = defaults.shellLift;
      live.settings.stackDepth = defaults.stackDepth;
      live.settings.quality = defaults.quality;
      live.settings.furAngle = defaults.furAngle;
      live.settings.furDensity = defaults.furDensity;
      live.settings.furSpeed = defaults.furSpeed;
      live.settings.furGravity = defaults.furGravity.clone();
      if (qualityChanged) {
        furEditorSnapshot = furEditorSnapshotFromInspectorDefaults(defaults);
        return rebuildFur().then(() => refreshFurMaskLength());
      }
      restoreFurProperties(fur.material, fur.shells, defaults);
      applyLiveFurSettings();
      void refreshFurMaskLength();
    },
  });

  initObjectHierarchyPanel();

  async function loadGlb(file: File): Promise<void> {
    if (!file.size) {
      const msg = "File is empty.";
      viewportEmpty.setStatus(msg);
      if (statusEl) statusEl.textContent = msg;
      return;
    }

    const gen = ++loadGeneration;
    if (statusEl) statusEl.textContent = "Loading model…";

    try {
      const imported = await importModelFile(scene, file);
      if (gen !== loadGeneration) {
        imported.container.dispose();
        return;
      }

      fur?.dispose();
      fur = null;
      furInspectorDefaults = null;
      furEditorSnapshot = null;
      furDensityMaskTexture = null;
      hullPbrMaterial = null;
      hullSurface = null;
      furDiffuseCache.clear();
      importContainer?.dispose();
      importContainer = imported.container;
      importRoots = imported.roots.slice();
      const rootsForCollect =
        importContainer.meshes.length > 0 ? importContainer.meshes.slice() : importRoots;
      const renderMeshes = collectRenderableMeshes(rootsForCollect);
      importedMeshes = renderMeshes;
      lastImportSummary = summarizeImport(renderMeshes);

      if (renderMeshes.length === 0) {
        const msg = "No mesh geometry found in file.";
        viewportEmpty.setVisible(true);
        viewportEmpty.setStatus(msg);
        if (statusEl) statusEl.textContent = msg;
        if (fileNameEl) fileNameEl.textContent = msg;
        return;
      }

      hullMesh = pickPrimaryHullMesh(renderMeshes);
      viewportEmpty.setVisible(false);
      viewportEmpty.resetStatus();
      importedLooksLikeBlenderShells = renderMeshes.length > BLENDER_SHELL_MESH_THRESHOLD;
      importedShellStack = lastImportSummary.looksLikeShellStack;

      normalizeImportedGltfMaterials(renderMeshes, {
        shellStack: importedShellStack,
        profile: pbrProfileId,
      });
      hullPbrMaterial =
        hullMesh?.material instanceof PBRMaterial ? hullMesh.material : null;
      hullSurface = hullPbrMaterial
        ? extractMaterialSurfaceFromMesh(hullPbrMaterial)
        : null;
      syncPbrProfileUi();

      live.enabled = false;
      if (furEnabledInput) furEnabledInput.checked = false;

      currentModelFileName = file.name;
      if (fileNameEl) fileNameEl.textContent = file.name;
      enableAllImportedMeshes();
      await rebuildFur();

      if (statusEl && lastImportSummary) {
        statusEl.textContent = formatImportStatus(lastImportSummary, file.name);
      }
      frameMeshes(camera, meshesForCameraFrame());
      refreshViewportPerfIndicator();
      pushImportState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load model.";
      viewportEmpty.setVisible(true);
      viewportEmpty.setStatus(`Load failed: ${msg}`);
      if (statusEl) statusEl.textContent = msg;
      if (fileNameEl) fileNameEl.textContent = `Load failed: ${msg}`;
      // eslint-disable-next-line no-console
      console.error("GLB load failed:", err);
    }
  }

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
    panel.querySelector("#pbr-profile-prev")?.addEventListener("click", () => {
      pbrProfileId = cyclePbrProfile(pbrProfileId, -1);
      refreshPbrProfile();
    });
    panel.querySelector("#pbr-profile-next")?.addEventListener("click", () => {
      pbrProfileId = cyclePbrProfile(pbrProfileId, 1);
      refreshPbrProfile();
    });
    syncPbrProfileUi();

    wireSceneSnapshotPanel(panel, scene, lightRig, lighting, camera, {
      getSource: () => ({
        modelFileName: currentModelFileName,
        theme: (document.documentElement.dataset.theme === "display" ? "display" : "studio") as ViewerTheme,
        pbrProfileId,
        furEnabled: live.enabled,
        furSettings: live.settings,
        lighting,
        camera,
      }),
      applySnapshot: async (snapshot: SceneSnapshotV1) => {
        const notes: string[] = [];

        pbrProfileId = snapshot.pbrProfileId;
        syncPbrProfileUi();

        live.enabled = snapshot.fur.enabled;
        live.settings = furSettingsFromSnapshot(snapshot.fur.settings);
        if (furEnabledInput) furEnabledInput.checked = live.enabled;

        if (snapshot.model?.fileName) {
          if (!currentModelFileName) {
            notes.push(`Load ${snapshot.model.fileName} to restore the full scene`);
          } else if (
            currentModelFileName.toLowerCase() !== snapshot.model.fileName.toLowerCase()
          ) {
            notes.push(
              `Model mismatch: loaded ${currentModelFileName}, preset expects ${snapshot.model.fileName}`,
            );
          } else {
            notes.push("Model name matches");
          }
        }

        if (importedMeshes.length > 0) {
          refreshPbrProfile();
        } else if (live.enabled) {
          notes.push("Fur settings saved — enable after loading the model");
        }

        await rebuildFur();
        refreshCameraConstraints();

        if (importedMeshes.length > 0) {
          frameMeshes(camera, meshesForCameraFrame());
        }

        notes.push("Preset applied");
        return notes;
      },
    });
  }

  if (furEnabledInput) furEnabledInput.checked = false;
  if (statusEl) statusEl.textContent = "Load a GLB or glTF to preview fur.";
  syncPbrProfileUi();
  refreshViewportPerfIndicator();

  const resetViewBtn = document.getElementById("viewer-reset");
  resetViewBtn?.addEventListener("click", () => {
    frameMeshes(camera, meshesForCameraFrame());
  });

  engine.runRenderLoop(() => scene.render());
  window.addEventListener("resize", () => engine.resize());
}
