import { describe, expect, it } from "vitest";

import { getDiffWorkerPoolConfig } from "./diffWorkerPoolConfig";

describe("getDiffWorkerPoolConfig", () => {
  it("caps a ten-core machine at three workers and bounded AST caches", () => {
    expect(getDiffWorkerPoolConfig(10)).toEqual({
      poolSize: 3,
      totalASTLRUCacheSize: 32,
    });
  });

  it("keeps two workers available on small or unavailable hardware reports", () => {
    expect(getDiffWorkerPoolConfig(2).poolSize).toBe(2);
    expect(getDiffWorkerPoolConfig(0).poolSize).toBe(2);
  });
});
