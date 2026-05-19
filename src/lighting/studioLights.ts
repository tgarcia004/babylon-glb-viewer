import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";

export interface LightParams {
  enabled: boolean;
  azimuth: number;
  elevation: number;
  intensity: number;
  color: string;
}

export interface StudioLightingState {
  key: LightParams;
  fill: LightParams;
  rim: LightParams;
  ambient: number;
}

export const STUDIO_LIGHT_DEFAULTS: StudioLightingState = {
  key: { enabled: true, azimuth: 318, elevation: 52, intensity: 1.2, color: "#fff6ee" },
  fill: { enabled: true, azimuth: 24, elevation: 62, intensity: 0.55, color: "#dcecff" },
  rim: { enabled: true, azimuth: 148, elevation: 28, intensity: 0.9, color: "#e8f4ff" },
  ambient: 0.12,
};

export interface StudioLightRig {
  key: DirectionalLight;
  fill: HemisphericLight;
  rim: DirectionalLight;
}

export function createStudioLightRig(scene: Scene): StudioLightRig {
  const key = new DirectionalLight("studioKey", new Vector3(-0.5, -1, -0.35), scene);
  key.position = new Vector3(6, 10, 6);

  const fill = new HemisphericLight("studioFill", new Vector3(0.2, 1, 0.1), scene);
  fill.groundColor = new Color3(0.06, 0.06, 0.08);

  const rim = new DirectionalLight("studioRim", new Vector3(0.4, -0.2, 0.9), scene);
  rim.position = new Vector3(-5, 4, -7);

  return { key, fill, rim };
}

/** Unit vector pointing from the origin toward the light (azimuth °, elevation °). */
export function lightDirectionFromAngles(azimuthDeg: number, elevationDeg: number): Vector3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const ce = Math.cos(el);
  return new Vector3(ce * Math.cos(az), Math.sin(el), ce * Math.sin(az)).normalize();
}

export function hexToColor3(hex: string): Color3 {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return new Color3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function applyStudioLighting(rig: StudioLightRig, scene: Scene, state: StudioLightingState): void {
  const { key, fill, rim } = rig;

  if (state.key.enabled) {
    const toward = lightDirectionFromAngles(state.key.azimuth, state.key.elevation);
    key.direction.copyFromFloats(-toward.x, -toward.y, -toward.z);
    key.intensity = state.key.intensity;
    key.diffuse = hexToColor3(state.key.color);
    key.setEnabled(true);
  } else {
    key.setEnabled(false);
  }

  if (state.fill.enabled) {
    const toward = lightDirectionFromAngles(state.fill.azimuth, state.fill.elevation);
    fill.direction.copyFrom(toward);
    fill.intensity = state.fill.intensity;
    fill.diffuse = hexToColor3(state.fill.color);
    fill.setEnabled(true);
  } else {
    fill.setEnabled(false);
  }

  if (state.rim.enabled) {
    const toward = lightDirectionFromAngles(state.rim.azimuth, state.rim.elevation);
    rim.direction.copyFromFloats(-toward.x, -toward.y, -toward.z);
    rim.intensity = state.rim.intensity;
    rim.diffuse = hexToColor3(state.rim.color);
    rim.setEnabled(true);
  } else {
    rim.setEnabled(false);
  }

  const amb = state.ambient;
  scene.ambientColor = new Color3(amb, amb, amb * 1.05);
}
