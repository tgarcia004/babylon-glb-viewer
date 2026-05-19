import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { ArcRotateCameraMouseWheelInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface MeshBounds {
  center: Vector3;
  diagonal: number;
}

interface FrameAnchor {
  center: Vector3;
  panLimit: number;
}

const frameAnchors = new WeakMap<ArcRotateCamera, FrameAnchor>();

function radiusLimits(camera: ArcRotateCamera): { min: number; max: number } {
  return {
    min: camera.lowerRadiusLimit ?? 0.01,
    max: camera.upperRadiusLimit ?? Number.MAX_VALUE,
  };
}

function clampRadius(camera: ArcRotateCamera): void {
  const { min, max } = radiusLimits(camera);
  if (camera.radius < min) {
    camera.radius = min;
  } else if (camera.radius > max) {
    camera.radius = max;
  }
  if (camera.radius <= min || camera.radius >= max) {
    camera.inertialRadiusOffset = 0;
  }
}

/** Keep orbit target near the framed model center (pan cannot drift far away). */
function clampPanTarget(camera: ArcRotateCamera): void {
  const anchor = frameAnchors.get(camera);
  if (!anchor) return;

  const offset = camera.target.subtract(anchor.center);
  const distSq = offset.lengthSquared();
  const limitSq = anchor.panLimit * anchor.panLimit;

  if (distSq > limitSq) {
    offset.normalizeFromLength(anchor.panLimit);
    camera.target.copyFrom(anchor.center.add(offset));
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  }
}

/**
 * Reliable orbit-camera zoom: blocks browser page zoom and drives camera.radius.
 * Babylon's built-in mousewheel input is removed to avoid fighting this handler.
 */
function wireCameraWheelZoom(camera: ArcRotateCamera, canvas: HTMLCanvasElement): void {
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();

    let deltaY = e.deltaY;
    if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      deltaY *= 40;
    }

    const magnitude = Math.min(Math.abs(deltaY), 200);
    const step = (magnitude / 100) * camera.radius * 0.04;
    const { min, max } = radiusLimits(camera);

    const delta = -Math.sign(deltaY) * step;
    camera.radius = Math.min(max, Math.max(min, camera.radius - delta));
    camera.inertialRadiusOffset = 0;
    camera.inertialPanningX = 0;
    camera.inertialPanningY = 0;
  };

  canvas.addEventListener("wheel", onWheel, { passive: false });
}

/** Orbit camera tuned for product-style inspection (smooth zoom, bounded radius). */
export function configureViewerCamera(camera: ArcRotateCamera, canvas: HTMLCanvasElement): void {
  camera.attachControl(canvas, false, true);

  const mousewheel = camera.inputs.attached.mousewheel as ArcRotateCameraMouseWheelInput | undefined;
  if (mousewheel) {
    camera.inputs.remove(mousewheel);
  }

  wireCameraWheelZoom(camera, canvas);

  camera.minZ = 0.03;
  camera.allowUpsideDown = false;
  camera.useInputToRestoreState = true;
  camera.restoreStateInterpolationFactor = 0.35;

  camera.inertia = 0.88;
  camera.panningInertia = 0.88;

  camera.angularSensibilityX = 1500;
  camera.angularSensibilityY = 1500;
  camera.panningSensibility = 1600;

  camera.pinchDeltaPercentage = 0.02;
  camera.useNaturalPinchZoom = false;

  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = Math.PI / 2 - 0.08;

  const scene = camera.getScene();
  scene.onBeforeRenderObservable.add(() => {
    clampRadius(camera);
    clampPanTarget(camera);
  });
}

export function computeMeshBounds(meshes: AbstractMesh[]): MeshBounds | null {
  if (meshes.length === 0) return null;

  let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  let max = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

  for (const mesh of meshes) {
    mesh.computeWorldMatrix(true);
    const bi = mesh.getBoundingInfo();
    min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
    max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
  }

  return {
    center: Vector3.Center(min, max),
    diagonal: Math.max(max.subtract(min).length(), 0.01),
  };
}

/** Update zoom/pan limits from bounds without moving the camera. */
export function applyViewerConstraints(camera: ArcRotateCamera, bounds: MeshBounds): void {
  const { center, diagonal } = bounds;

  const minRadius = Math.max(diagonal * 0.48, 0.55);
  const maxRadius = Math.max(diagonal * 2.75, minRadius * 2.2);
  const panLimit = Math.max(diagonal * 0.3, 0.25);

  frameAnchors.set(camera, { center: center.clone(), panLimit });
  camera.panningOriginTarget.copyFrom(center);
  camera.panningDistanceLimit = panLimit;
  camera.lowerRadiusLimit = minRadius;
  camera.upperRadiusLimit = maxRadius;

  clampPanTarget(camera);
  clampRadius(camera);
}

/** Frame the camera on mesh bounds and clamp zoom so you cannot fly through the model. */
export function frameCameraOnBounds(camera: ArcRotateCamera, bounds: MeshBounds): void {
  const { center, diagonal } = bounds;

  const minRadius = Math.max(diagonal * 0.48, 0.55);
  const maxRadius = Math.max(diagonal * 2.75, minRadius * 2.2);
  const idealRadius = Math.max(diagonal * 0.72, minRadius * 1.08);

  applyViewerConstraints(camera, bounds);

  camera.setTarget(center);
  camera.radius = Math.min(Math.max(idealRadius, minRadius), maxRadius);
  camera.inertialRadiusOffset = 0;
  camera.inertialPanningX = 0;
  camera.inertialPanningY = 0;

  camera.storeState();
}

export function frameMeshes(camera: ArcRotateCamera, meshes: AbstractMesh[]): void {
  const bounds = computeMeshBounds(meshes);
  if (bounds) frameCameraOnBounds(camera, bounds);
}
