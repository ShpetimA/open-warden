import { describe, expect, it } from "vitest";

import { createRendererConfig } from "./vite.shared.config";

describe("createRendererConfig", () => {
  it("uses a relative base so packaged Electron can resolve renderer assets", () => {
    expect(createRendererConfig().base).toBe("./");
  });
});
