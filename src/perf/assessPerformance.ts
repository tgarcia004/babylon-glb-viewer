import { ALL_DEVICE_TIERS, type DeviceTierProfile } from "./deviceCatalog";

export type PerfLevel = "good" | "caution" | "heavy" | "too-heavy";

export interface PerfSnapshot {
  triangleCount: number;
  meshCount: number;
  furEnabled: boolean;
}

export interface DeviceTierAssessment {
  id: string;
  label: string;
  level: PerfLevel;
  profile: DeviceTierProfile;
}

export interface PerformanceAssessment {
  snapshot: PerfSnapshot;
  loadScore: number;
  tiers: DeviceTierAssessment[];
  worstLevel: PerfLevel;
  summaryLabel: string;
}

const MESH_DRAW_COST = 2_500;

const LIMITS: Record<string, { caution: number; heavy: number; tooHeavy: number }> = {
  "portable-old": { caution: 80_000, heavy: 180_000, tooHeavy: 320_000 },
  "portable-medium": { caution: 180_000, heavy: 400_000, tooHeavy: 750_000 },
  "portable-new": { caution: 350_000, heavy: 800_000, tooHeavy: 1_400_000 },
  "desktop-old": { caution: 250_000, heavy: 600_000, tooHeavy: 1_100_000 },
  "desktop-medium": { caution: 550_000, heavy: 1_200_000, tooHeavy: 2_200_000 },
  "desktop-new": { caution: 1_000_000, heavy: 2_500_000, tooHeavy: 4_500_000 },
};

const LEVEL_RANK: Record<PerfLevel, number> = {
  good: 0,
  caution: 1,
  heavy: 2,
  "too-heavy": 3,
};

const LEVEL_LABEL: Record<PerfLevel, string> = {
  good: "OK",
  caution: "Caution",
  heavy: "Heavy",
  "too-heavy": "Too heavy",
};

/** Plain-language meanings for the rating key in the viewport panel. */
export const PERF_RATING_KEY: { level: PerfLevel; label: string; meaning: string }[] = [
  {
    level: "good",
    label: "OK",
    meaning: "This scene should run smoothly on devices in that tier. No changes required.",
  },
  {
    level: "caution",
    label: "Caution",
    meaning: "Playable, but you may see frame drops when orbiting, zooming, or on battery power. Consider fewer shells or lower fur quality.",
  },
  {
    level: "heavy",
    label: "Heavy",
    meaning: "Expect noticeable slowdown. Reduce mesh count, shell layers, texture size, or turn fur off for that tier.",
  },
  {
    level: "too-heavy",
    label: "Too heavy",
    meaning: "Not recommended for that tier — likely stutter, long loads, or browser tab crashes. Simplify the asset before shipping.",
  },
];

const CHIP_LABEL: Record<PerfLevel, string> = {
  good: "Light load",
  caution: "Moderate load",
  heavy: "Heavy load",
  "too-heavy": "Too heavy",
};

export function computeLoadScore(snapshot: PerfSnapshot): number {
  let score = Math.max(0, snapshot.triangleCount);
  score += Math.max(0, snapshot.meshCount) * MESH_DRAW_COST;
  if (snapshot.furEnabled) {
    score = Math.round(score * 1.08);
  }
  return score;
}

function levelForScore(score: number, tierId: string): PerfLevel {
  const limits = LIMITS[tierId];
  if (score >= limits.tooHeavy) return "too-heavy";
  if (score >= limits.heavy) return "heavy";
  if (score >= limits.caution) return "caution";
  return "good";
}

export function assessPerformance(snapshot: PerfSnapshot): PerformanceAssessment {
  const loadScore = computeLoadScore(snapshot);
  const tiers = ALL_DEVICE_TIERS.map((profile) => ({
    id: profile.id,
    label: profile.label,
    level: levelForScore(loadScore, profile.id),
    profile,
  }));

  let worstLevel: PerfLevel = "good";
  for (const tier of tiers) {
    if (LEVEL_RANK[tier.level] > LEVEL_RANK[worstLevel]) {
      worstLevel = tier.level;
    }
  }

  return {
    snapshot,
    loadScore,
    tiers,
    worstLevel,
    summaryLabel: CHIP_LABEL[worstLevel],
  };
}

export function levelLabel(level: PerfLevel): string {
  return LEVEL_LABEL[level];
}

export function formatLoadSummary(assessment: PerformanceAssessment): string {
  const { snapshot, loadScore } = assessment;
  const tris = snapshot.triangleCount.toLocaleString();
  const meshes = snapshot.meshCount.toLocaleString();
  const fur = snapshot.furEnabled ? " · fur on" : "";
  return `${tris} tris · ${meshes} meshes · score ${loadScore.toLocaleString()}${fur}`;
}

export { ALL_DEVICE_TIERS, PORTABLE_TIERS, DESKTOP_TIERS } from "./deviceCatalog";
export type { DeviceTierProfile } from "./deviceCatalog";
