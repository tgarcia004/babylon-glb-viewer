/** Public Khronos sample — safe to host on GitHub for latency testing only. */
export const BENCHMARK_MODEL_FILE = "benchmark-latency.glb";
export const BENCHMARK_MODEL_LABEL = "Latency benchmark";
export const BENCHMARK_MODEL_PURPOSE = "latency-benchmark" as const;

export function isBenchmarkModel(entry: { name: string; purpose?: string }): boolean {
  return (
    entry.purpose === BENCHMARK_MODEL_PURPOSE ||
    entry.name === BENCHMARK_MODEL_FILE
  );
}
