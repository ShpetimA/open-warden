import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { browseDirectory } from "./directories";

it("lists directories and directory symlinks, excluding files and broken links", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "warden-directories-"));
  try {
    await mkdir(path.join(root, "project"));
    await writeFile(path.join(root, "file.txt"), "test");
    await symlink(path.join(root, "project"), path.join(root, "linked"));
    await symlink(path.join(root, "missing"), path.join(root, "broken"));
    const result = await browseDirectory(root);
    expect(result).toEqual({
      ok: true,
      path: root,
      parentPath: path.dirname(root),
      entries: [
        { name: "linked", path: path.join(root, "linked") },
        { name: "project", path: path.join(root, "project") },
      ],
    });
    expect((await browseDirectory(path.join(root, "missing"))).ok).toBe(false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it("expands home and rejects relative paths", async () => {
  const result = await browseDirectory("~/");
  expect(result.ok && result.path).toBe(homedir());
  expect((await browseDirectory("relative")).ok).toBe(false);
});
