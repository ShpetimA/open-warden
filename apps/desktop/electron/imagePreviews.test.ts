import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import type { FileContent } from "../src/platform/desktop/fileContent";
import {
  IMAGE_PREVIEW_MAX_BYTES,
  imageFileSchema,
  imagePreviewDataSchema,
} from "../src/platform/desktop/imagePreview";
import {
  getRepoFile,
  getImagePreview,
  getFileVersions,
  getCommitFileVersions,
  getBranchFileVersions,
} from "./git";

const roots: string[] = [];
const fixtures = path.resolve("tests/fixtures/images");
const imagePath = "assets/[logo].dat";

vi.setConfig({ testTimeout: 30_000 });

function git(repo: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "warden-images-"));
  roots.push(root);
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, imagePath), await readFile(path.join(fixtures, "before.png")));
  git(root, "add", ".");
  git(root, "commit", "-m", "Base image");
  return root;
}

function preview(file: FileContent | null) {
  const image = imageFileSchema.parse(file);
  if (image.preview.state !== "available") throw new Error("Expected an available image preview");
  return image.preview;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("image references preserve staged, worktree, historical and renamed versions without caching bytes", async () => {
  const repo = await repository();
  const base = git(repo, "rev-parse", "HEAD");
  const before = await readFile(path.join(fixtures, "before.png"));
  const after = await readFile(path.join(fixtures, "after.png"));
  await writeFile(path.join(repo, imagePath), after);
  git(repo, "add", ".");

  const versions = await getFileVersions(repo, imagePath, "staged", null);
  const oldImage = preview(versions.oldFile);
  const newImage = preview(versions.newFile);
  expect(oldImage.width).toBe(640);
  expect(newImage.width).toBe(800);
  expect(JSON.stringify(versions)).not.toContain("base64");

  await writeFile(path.join(repo, imagePath), before);
  const reply = await getImagePreview(newImage.source);
  expect(reply.ok).toBe(true);
  if (!reply.ok) throw new Error(reply.error.message);
  expect(imagePreviewDataSchema.parse(reply.value)).toEqual(reply.value);
  expect(Buffer.from(reply.value.bytes)).toEqual(after);
  expect(preview(await getRepoFile({ repoPath: repo, relPath: imagePath })).width).toBe(640);

  git(repo, "commit", "-m", "Update image");
  const head = git(repo, "rev-parse", "HEAD");
  expect(await getCommitFileVersions(repo, head, imagePath)).toEqual(versions);
  expect(await getBranchFileVersions(repo, base, head, imagePath)).toEqual(versions);
  git(repo, "restore", "--worktree", "--", imagePath);
  git(repo, "mv", imagePath, "assets/renamed.png");
  expect(
    (await getFileVersions(repo, "assets/renamed.png", "staged", imagePath)).oldFile?.name,
  ).toBe(imagePath);
  expect(preview(await getRepoFile({ repoPath: repo, relPath: "assets/renamed.png" })).width).toBe(
    800,
  );
});

test("stale image sources and link replacements fail without returning the wrong bytes", async () => {
  const repo = await repository();
  const source = preview(await getRepoFile({ repoPath: repo, relPath: imagePath })).source;
  await writeFile(path.join(repo, imagePath), await readFile(path.join(fixtures, "after.png")));
  expect(await getImagePreview(source)).toMatchObject({ ok: false, error: { code: "conflict" } });

  await unlink(path.join(repo, imagePath));
  await symlink(path.join(fixtures, "after.png"), path.join(repo, imagePath));
  expect(await getImagePreview(source)).toMatchObject({ ok: false, error: { code: "conflict" } });
  expect(
    await getImagePreview({
      kind: "worktree",
      repoPath: repo,
      relPath: "../outside.png",
      digest: "a".repeat(64),
    }),
  ).toMatchObject({ ok: false, error: { code: "invalid-input" } });
});

test("supported raster signatures load independently of filename extensions", async () => {
  const repo = await repository();

  for (const [file, mimeType] of [
    ["small.jpg", "image/jpeg"],
    ["small.gif", "image/gif"],
    ["small.webp", "image/webp"],
  ]) {
    await writeFile(path.join(repo, imagePath), await readFile(path.join(fixtures, file)));
    const image = preview(await getRepoFile({ repoPath: repo, relPath: imagePath }));
    expect(image.mimeType).toBe(mimeType);
    expect(await getImagePreview(image.source)).toMatchObject({
      ok: true,
      value: { mimeType, width: 24, height: 16 },
    });
  }
});

test("image limits and malformed headers return metadata instead of oversized preview payloads", async () => {
  const repo = await repository();
  const bytes = await readFile(path.join(fixtures, "before.png"));
  const tooBig = Buffer.alloc(IMAGE_PREVIEW_MAX_BYTES + 1);
  bytes.copy(tooBig);
  await writeFile(path.join(repo, imagePath), tooBig);
  expect(await getRepoFile({ repoPath: repo, relPath: imagePath })).toMatchObject({
    kind: "image",
    preview: { state: "unavailable", reason: "byte-limit" },
  });

  const hugeDimensions = Buffer.from(bytes);
  hugeDimensions.writeUInt32BE(10_000, 16);
  hugeDimensions.writeUInt32BE(10_000, 20);
  await writeFile(path.join(repo, imagePath), hugeDimensions);
  expect(await getRepoFile({ repoPath: repo, relPath: imagePath })).toMatchObject({
    kind: "image",
    preview: { state: "unavailable", reason: "pixel-limit" },
  });

  await writeFile(path.join(repo, imagePath), bytes.subarray(0, 8));
  expect(await getRepoFile({ repoPath: repo, relPath: imagePath })).toMatchObject({
    kind: "image",
    preview: { state: "unavailable", reason: "invalid-image" },
  });

  await writeFile(
    path.join(repo, imagePath),
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  );
  expect(await getRepoFile({ repoPath: repo, relPath: imagePath })).toHaveProperty("contents");
});

test("an image read failure does not block the next queued preview", async () => {
  const repo = await repository();
  const source = preview(await getRepoFile({ repoPath: repo, relPath: imagePath })).source;
  const [missing, valid] = await Promise.all([
    getImagePreview({ kind: "git", repoPath: repo, objectId: "a".repeat(40) }),
    getImagePreview(source),
  ]);
  expect(missing.ok).toBe(false);
  expect(valid).toMatchObject({ ok: true, value: { width: 640, height: 320 } });
});
