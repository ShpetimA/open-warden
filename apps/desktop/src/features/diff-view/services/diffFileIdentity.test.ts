import { describe, expect, it } from "vitest";

import { getDiffFileIdentity } from "./diffFileIdentity";

describe("getDiffFileIdentity", () => {
  it("returns equal identities for equal immutable file values", () => {
    expect(getDiffFileIdentity({ name: "src/a.ts", contents: "export const a = 1;" })).toBe(
      getDiffFileIdentity({ name: "src/a.ts", contents: "export const a = 1;" }),
    );
  });

  it("distinguishes file contents and names", () => {
    const original = getDiffFileIdentity({ name: "src/a.ts", contents: "one" });

    expect(getDiffFileIdentity({ name: "src/a.ts", contents: "two" })).not.toBe(original);
    expect(getDiffFileIdentity({ name: "src/b.ts", contents: "one" })).not.toBe(original);
  });

  it("uses an explicit identity for a missing side of a diff", () => {
    expect(getDiffFileIdentity(null)).toBe("missing");
  });
});
