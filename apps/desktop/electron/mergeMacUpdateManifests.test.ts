import { describe, expect, test } from "vitest";

import {
  mergeMacUpdateManifests,
  parseMacUpdateManifest,
  serializeMacUpdateManifest,
} from "../../../scripts/merge-mac-update-manifests.mjs";

describe("mergeMacUpdateManifests", () => {
  test("merges arm64 and x64 manifests into a single latest-mac manifest", () => {
    const arm64 = parseMacUpdateManifest(
      [
        "version: 1.2.3",
        "files:",
        "  - url: OpenWarden-1.2.3-arm64.zip",
        "    sha512: abc",
        "    size: 100",
        "path: OpenWarden-1.2.3-arm64.zip",
        "sha512: abc",
        "releaseDate: '2026-03-14T10:00:00.000Z'",
      ].join("\n"),
      "arm64.yml",
    );
    const x64 = parseMacUpdateManifest(
      [
        "version: 1.2.3",
        "files:",
        "  - url: OpenWarden-1.2.3-x64.zip",
        "    sha512: def",
        "    size: 200",
        "path: OpenWarden-1.2.3-x64.zip",
        "sha512: def",
        "releaseDate: '2026-03-14T10:05:00.000Z'",
      ].join("\n"),
      "x64.yml",
    );

    const merged = mergeMacUpdateManifests(arm64, x64);
    const serialized = serializeMacUpdateManifest(merged);

    expect(merged.files).toHaveLength(2);
    expect(merged.releaseDate).toBe("2026-03-14T10:05:00.000Z");
    expect(serialized).toContain("OpenWarden-1.2.3-arm64.zip");
    expect(serialized).toContain("OpenWarden-1.2.3-x64.zip");
  });
});
