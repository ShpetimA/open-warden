import { describe, expect, it } from "vitest";

import { createAppSettings, DEFAULT_APP_SETTINGS } from "@/platform/desktop/appSettings";

describe("appSettings helpers", () => {
  it("returns defaults for missing or invalid settings", () => {
    expect(createAppSettings()).toEqual(DEFAULT_APP_SETTINGS);
    expect(createAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(createAppSettings({})).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("normalizes known settings fields", () => {
    expect(
      createAppSettings({
        version: 99,
        sourceControl: {
          fileTreeRenderMode: "list",
        },
      }),
    ).toEqual({
      version: 1,
      sourceControl: {
        fileTreeRenderMode: "list",
      },
      lsp: {
        servers: {},
      },
    });
  });

});
