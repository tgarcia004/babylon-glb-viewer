import "@babylonjs/loaders/glTF";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

import { hostModelAssetUrls, type HostModelEntry } from "./hostClient";
import { computeMeshBounds } from "../viewer/configureCamera";

/** Pull the camera back so small thumbnails show the full silhouette. */
function frameThumbnailCamera(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  const bounds = computeMeshBounds(meshes);
  if (!bounds) return;

  const { center, diagonal } = bounds;
  const radius = Math.max(diagonal * 1.55, 1.4);

  camera.setTarget(center);
  camera.radius = radius;
  camera.alpha = -Math.PI / 2.15;
  camera.beta = Math.PI / 2.65;
  camera.lowerRadiusLimit = radius * 0.4;
  camera.upperRadiusLimit = radius * 4;
  camera.inertialRadiusOffset = 0;
}

export class HostModelThumbnail {
  private canvas: HTMLCanvasElement;
  private loadingEl: HTMLElement | null;
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private loadedMeshes: AbstractMesh[] = [];
  private loadGeneration = 0;
  private active = false;
  private spinOffset = Math.random() * Math.PI * 2;

  constructor(canvas: HTMLCanvasElement, loadingEl?: HTMLElement | null) {
    this.canvas = canvas;
    this.loadingEl = loadingEl ?? null;
  }

  private ensureEngine(): void {
    if (this.engine) return;

    this.engine = new Engine(this.canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      adaptToDeviceRatio: true,
      antialias: true,
    });

    this.scene = new Scene(this.engine);
    this.scene.clearColor = new Color4(0.08, 0.08, 0.1, 1);

    this.camera = new ArcRotateCamera("thumbCam", -Math.PI / 2, Math.PI / 2.65, 4, Vector3.Zero(), this.scene);
    this.camera.lowerRadiusLimit = 0.05;
    this.camera.upperRadiusLimit = 500;
    this.camera.inputs.clear();

    const light = new HemisphericLight("thumbLight", new Vector3(0.15, 1, 0.35), this.scene);
    light.intensity = 1.1;
    light.groundColor.set(0.4, 0.4, 0.42);

    this.engine.runRenderLoop(() => {
      if (!this.scene || !this.camera || !this.active) return;
      if (this.loadedMeshes.length > 0) {
        this.camera.alpha = this.spinOffset + performance.now() * 0.00025;
      }
      this.scene.render();
    });
  }

  private setLoading(on: boolean): void {
    if (this.loadingEl) {
      this.loadingEl.hidden = !on;
    }
    this.canvas.classList.toggle("is-loading", on);
  }

  private clearMeshes(): void {
    for (const mesh of this.loadedMeshes) {
      mesh.dispose(false, true);
    }
    this.loadedMeshes = [];
  }

  async load(baseUrl: string, entry: HostModelEntry): Promise<void> {
    this.ensureEngine();
    if (!this.scene || !this.camera) return;

    const generation = ++this.loadGeneration;
    this.active = true;
    this.clearMeshes();
    this.setLoading(true);

    const { rootUrl, fileName } = hostModelAssetUrls(baseUrl, entry);

    try {
      const result = await SceneLoader.ImportMeshAsync("", rootUrl, fileName, this.scene);
      if (generation !== this.loadGeneration) {
        for (const mesh of result.meshes) {
          mesh.dispose(false, true);
        }
        return;
      }

      this.loadedMeshes = result.meshes.filter((m): m is AbstractMesh => m instanceof AbstractMesh);
      if (this.loadedMeshes.length === 0) {
        this.setLoading(false);
        this.canvas.classList.add("is-error");
        return;
      }

      frameThumbnailCamera(this.camera, this.loadedMeshes);
      this.canvas.classList.remove("is-error");
      this.setLoading(false);
    } catch {
      if (generation !== this.loadGeneration) return;
      this.setLoading(false);
      this.canvas.classList.add("is-error");
    }
  }

  pause(): void {
    this.active = false;
    this.loadGeneration += 1;
    this.clearMeshes();
    this.setLoading(false);
    this.canvas.classList.remove("is-error", "is-loading");
  }

  dispose(): void {
    this.pause();
    this.scene?.dispose();
    this.engine?.dispose();
    this.scene = null;
    this.engine = null;
    this.camera = null;
  }
}

const activeThumbnails = new Set<HostModelThumbnail>();

export function trackHostThumbnail(thumb: HostModelThumbnail): void {
  activeThumbnails.add(thumb);
}

export function disposeAllHostThumbnails(): void {
  for (const thumb of activeThumbnails) {
    thumb.dispose();
  }
  activeThumbnails.clear();
}
