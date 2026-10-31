import { expect, test } from "vitest";

import { imageFileSchema, imageSourceSchema, imagePreviewDataSchema } from "./imagePreview";

test("image replies require bounded typed arrays and valid dimensions", () => {
  const packet = {
    mimeType: "image/png",
    width: 1,
    height: 1,
    byteLength: 3,
    bytes: new Uint8Array(3),
  };
  expect(imagePreviewDataSchema.parse(packet)).toEqual(packet);

  for (const invalid of [
    { ...packet, bytes: "https://example.com/image.png" },
    { ...packet, mimeType: "image/svg+xml" },
    { ...packet, bytes: [0, 0, 0] },
    { ...packet, bytes: new Uint8Array(2) },
    { ...packet, width: 0 },
    { ...packet, width: 5000, height: 5000 },
    { ...packet, byteLength: 9 * 1024 * 1024 },
  ])
    expect(imagePreviewDataSchema.safeParse(invalid).success).toBe(false);
});

test("image references contain metadata and reject unsafe worktree paths", () => {
  const source = {
    kind: "worktree",
    repoPath: "/repo",
    relPath: "assets/icon.png",
    digest: "a".repeat(64),
  };
  expect(imageSourceSchema.parse(source)).toEqual(source);

  for (const relPath of [
    "../outside.png",
    "/absolute.png",
    "assets/../outside.png",
    ".git/image.png",
    "assets\0.png",
  ]) {
    expect(imageSourceSchema.safeParse({ ...source, relPath }).success).toBe(false);
  }

  expect(
    imageFileSchema.safeParse({
      kind: "image",
      name: "image.png",
      byteLength: 9 * 1024 * 1024,
      preview: { state: "available", width: 1, height: 1, mimeType: "image/png", source },
    }).success,
  ).toBe(false);
});
