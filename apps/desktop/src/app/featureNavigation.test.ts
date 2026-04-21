import { describe, expect, it } from "vitest";

import { FEATURE_NAV_ITEMS, featureKeyFromPath } from "@/app/featureNavigation";

describe("feature navigation", () => {
  it("maps routes to feature keys", () => {
    expect(featureKeyFromPath("/changes")).toBe("changes");
    expect(featureKeyFromPath("/pull-requests")).toBe("pull-requests");
    expect(featureKeyFromPath("/history")).toBe("history");
    expect(featureKeyFromPath("/review")).toBe("review");
    expect(featureKeyFromPath("/comments")).toBe("changes");
    expect(featureKeyFromPath("/")).toBe("changes");
    expect(featureKeyFromPath("/unknown/path")).toBe("changes");
  });

  it("exposes all top-level feature tabs", () => {
    expect(FEATURE_NAV_ITEMS.map((item) => item.key)).toEqual([
      "changes",
      "pull-requests",
      "history",
      "review",
    ]);
  });
});
