export type DiffWorkerPoolConfig = {
  readonly poolSize: number;
  readonly totalASTLRUCacheSize: number;
};

const DEFAULT_HARDWARE_CONCURRENCY = 4;
const MIN_WORKER_POOL_SIZE = 2;
const MAX_WORKER_POOL_SIZE = 3;
const AST_CACHE_ENTRIES_PER_KIND = 32;

/** Derives bounded worker and AST-cache counts from the reported logical core count. */
export function getDiffWorkerPoolConfig(hardwareConcurrency: number): DiffWorkerPoolConfig {
  const cores =
    Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0
      ? Math.floor(hardwareConcurrency)
      : DEFAULT_HARDWARE_CONCURRENCY;
  const poolSize = Math.max(
    MIN_WORKER_POOL_SIZE,
    Math.min(MAX_WORKER_POOL_SIZE, Math.ceil(cores / 4)),
  );

  return {
    poolSize,
    totalASTLRUCacheSize: AST_CACHE_ENTRIES_PER_KIND,
  };
}
