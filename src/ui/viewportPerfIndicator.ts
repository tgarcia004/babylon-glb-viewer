import {
  assessPerformance,
  formatLoadSummary,
  levelLabel,
  PERF_RATING_KEY,
  type PerfLevel,
  type PerfSnapshot,
  type PerformanceAssessment,
} from "../perf/assessPerformance";
import { PORTABLE_TIERS } from "../perf/deviceCatalog";

const STORAGE_KEY = "fur-viewport-perf-open";

type MetricsProvider = () => PerfSnapshot;

let provider: MetricsProvider = () => ({
  triangleCount: 12 * 2 * 3,
  meshCount: 1,
  furEnabled: true,
});

let lastAssessment: PerformanceAssessment | null = null;
let rafPending = false;
let legendBuilt = false;

export function registerPerfMetricsProvider(fn: MetricsProvider): void {
  provider = fn;
}

function loadOpenPreference(): boolean {
  return sessionStorage.getItem(STORAGE_KEY) === "1";
}

function saveOpenPreference(open: boolean): void {
  sessionStorage.setItem(STORAGE_KEY, open ? "1" : "0");
}

function buildTierRow(tier: PerformanceAssessment["tiers"][0]): HTMLElement {
  const block = document.createElement("article");
  block.className = "viewport-perf-tier-block";
  block.dataset.level = tier.level;

  const head = document.createElement("header");
  head.className = "viewport-perf-tier-head";

  const title = document.createElement("span");
  title.className = "viewport-perf-tier-title";
  title.textContent = tier.profile.label;

  const status = document.createElement("span");
  status.className = "viewport-perf-status";
  status.textContent = levelLabel(tier.level);

  head.append(title, status);

  const meta = document.createElement("p");
  meta.className = "viewport-perf-tier-meta";
  meta.textContent = `${tier.profile.yearRange} · ${tier.profile.chipNote} · ${tier.profile.ramNote}`;

  const summary = document.createElement("p");
  summary.className = "viewport-perf-tier-summary";
  summary.textContent = tier.profile.summary;

  const examplesLabel = document.createElement("p");
  examplesLabel.className = "viewport-perf-examples-label";
  examplesLabel.textContent = "Examples in this tier";

  const examples = document.createElement("ul");
  examples.className = "viewport-perf-examples";
  for (const name of tier.profile.examples) {
    const li = document.createElement("li");
    li.textContent = name;
    examples.append(li);
  }

  block.append(head, meta, summary, examplesLabel, examples);
  return block;
}

function buildLegend(root: HTMLElement): void {
  if (legendBuilt) return;
  const legend = root.querySelector<HTMLElement>("#viewport-perf-legend");
  if (!legend) return;

  const keyTitle = document.createElement("p");
  keyTitle.className = "viewport-perf-key-title";
  keyTitle.textContent = "Rating key";

  const keyList = document.createElement("dl");
  keyList.className = "viewport-perf-key";
  for (const item of PERF_RATING_KEY) {
    const row = document.createElement("div");
    row.className = "viewport-perf-key-row";
    row.dataset.level = item.level;

    const dt = document.createElement("dt");
    dt.className = "viewport-perf-key-label";
    dt.textContent = item.label;

    const dd = document.createElement("dd");
    dd.className = "viewport-perf-key-meaning";
    dd.textContent = item.meaning;

    row.append(dt, dd);
    keyList.append(row);
  }

  const intro = document.createElement("p");
  intro.className = "viewport-perf-legend-intro";
  intro.textContent =
    "Tiers are based on GPU generation and RAM. Your field list maps roughly as: Air 2 / 5th–6th iPad / 10.5″ Pro → old; Air 4th & iPhone 12–14 → medium; M1+ iPad Air, iPad Pro, A16 iPad, 15/17 Pro → new.";

  legend.append(keyTitle, keyList, intro);

  const chips = document.createElement("div");
  chips.className = "viewport-perf-legend-chips";
  for (const tier of PORTABLE_TIERS) {
    const chip = document.createElement("span");
    chip.className = "viewport-perf-legend-chip";
    chip.textContent = `${tier.tierName}: ${tier.examples.slice(0, 2).join(", ")}…`;
    chips.append(chip);
  }
  legend.append(chips);
  legendBuilt = true;
}

function renderAssessment(root: HTMLElement, assessment: PerformanceAssessment): void {
  const chip = root.querySelector<HTMLElement>("#viewport-perf-chip");
  const detail = root.querySelector<HTMLElement>("#viewport-perf-detail");
  const grid = root.querySelector<HTMLElement>("#viewport-perf-grid");

  buildLegend(root);

  if (chip) {
    chip.textContent = assessment.summaryLabel;
    chip.dataset.level = assessment.worstLevel;
  }
  if (detail) {
    detail.textContent = formatLoadSummary(assessment);
  }
  if (grid) {
    grid.replaceChildren();
    for (const tier of assessment.tiers) {
      grid.append(buildTierRow(tier));
    }
  }

  root.dataset.level = assessment.worstLevel;
}

export function updateViewportPerfIndicator(): void {
  const root = document.getElementById("viewport-perf");
  if (!root) return;

  const assessment = assessPerformance(provider());
  const prev = lastAssessment?.snapshot;
  const next = assessment.snapshot;
  const changed =
    !lastAssessment ||
    lastAssessment.loadScore !== assessment.loadScore ||
    lastAssessment.worstLevel !== assessment.worstLevel ||
    prev?.triangleCount !== next.triangleCount ||
    prev?.meshCount !== next.meshCount ||
    prev?.furEnabled !== next.furEnabled;

  lastAssessment = assessment;
  if (changed) {
    renderAssessment(root, assessment);
  }
}

function scheduleUpdate(): void {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    updateViewportPerfIndicator();
  });
}

export function initViewportPerfIndicator(): void {
  const root = document.getElementById("viewport-perf");
  if (!root) return;

  const toggle = root.querySelector<HTMLButtonElement>(".viewport-perf-toggle");
  const panel = root.querySelector<HTMLElement>(".viewport-perf-panel");
  if (!toggle || !panel) return;

  const setOpen = (open: boolean) => {
    root.classList.toggle("is-collapsed", !open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.hidden = !open;
    saveOpenPreference(open);
  };

  setOpen(loadOpenPreference());

  toggle.addEventListener("click", () => {
    setOpen(root.classList.contains("is-collapsed"));
  });

  updateViewportPerfIndicator();
  scheduleUpdate();
}

export function refreshViewportPerfIndicator(): void {
  scheduleUpdate();
}

export type { PerfLevel, PerfSnapshot };
