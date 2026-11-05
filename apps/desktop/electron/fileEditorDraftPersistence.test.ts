import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";

import {
  fileDocumentChanged,
  fileDocumentClosed,
  fileDocumentOpened,
  fileDocumentReloaded,
  fileEditorDraftsRestored,
  fileEditorReducer,
  fileSaveFailed,
  fileSaveSucceeded,
  serializeFileEditorDrafts,
  workingFileKey,
} from "../src/features/source-control/fileEditorSlice";
import {
  createWorkspaceSession,
  storedWorkspaceSessionSchema,
} from "../src/platform/desktop/workspaceSession";
import { createAtomicJsonStore } from "./atomicJsonStore";
import { updateWorktreeFileContents } from "./fileEdits";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function savedDraft() {
  const repoPath = await mkdtemp(path.join(os.tmpdir(), "warden-editor-draft-"));
  directories.push(repoPath);
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], { cwd: repoPath });

  const target = { repoPath, relPath: "note.txt" };
  const baseContents = "Saved text\r\n";
  const contents = "Recovered draft €\r\n";
  await writeFile(path.join(repoPath, target.relPath), baseContents);

  const state = fileEditorReducer(
    undefined,
    fileDocumentChanged({ ...target, baseContents, contents }),
  );
  const file = path.join(repoPath, ".git", "editor-session.json");
  const storage = createAtomicJsonStore({
    file,
    schema: storedWorkspaceSessionSchema,
    empty: createWorkspaceSession,
    operation: "workspaceSession",
  });
  const written = await storage.write({
    openRepos: [repoPath],
    activeRepo: repoPath,
    recentRepos: [],
    fileEditorDrafts: serializeFileEditorDrafts(state),
  });
  expect(written.ok).toBe(true);

  const loaded = await storage.read();
  if (!loaded.ok) throw new Error("The saved draft must load");

  const session = createWorkspaceSession(loaded.value.data);
  const restored = fileEditorReducer(
    undefined,
    fileEditorDraftsRestored(session.fileEditorDrafts ?? []),
  );

  return { target, baseContents, contents, state: restored };
}

test("restores dirty buffers and their original save baseline through atomic workspace storage", async () => {
  const { target, baseContents, contents, state } = await savedDraft();
  const key = workingFileKey(target);
  const reopened = fileEditorReducer(
    state,
    fileDocumentOpened({ ...target, contents: baseContents }),
  );

  expect(reopened.documents[key]).toMatchObject({ baseContents, contents, save: { kind: "idle" } });

  const saved = await updateWorktreeFileContents(target.repoPath, target.relPath, contents, {
    kind: "worktree",
    contents: baseContents,
  });
  expect(saved).toEqual({ ok: true, value: undefined });
  expect(await readFile(path.join(target.repoPath, target.relPath), "utf8")).toBe(contents);

  const completed = fileEditorReducer(reopened, fileSaveSucceeded({ ...target, contents }));
  expect(serializeFileEditorDrafts(completed)).toEqual([]);
});

test("a restored draft cannot overwrite external changes and survives closing until explicit reload", async () => {
  const { target, baseContents, contents, state } = await savedDraft();
  const external = "Changed outside OpenWarden\r\n";
  await writeFile(path.join(target.repoPath, target.relPath), external);

  let current = fileEditorReducer(state, fileDocumentOpened({ ...target, contents: external }));
  const saved = await updateWorktreeFileContents(target.repoPath, target.relPath, contents, {
    kind: "worktree",
    contents: baseContents,
  });

  expect(saved).toMatchObject({ ok: false, error: { code: "conflict" } });
  if (saved.ok) throw new Error("A stale save must fail");

  current = fileEditorReducer(current, fileSaveFailed({ ...target, error: saved.error }));
  current = fileEditorReducer(current, fileDocumentClosed(target));
  expect(serializeFileEditorDrafts(current)).toEqual([{ ...target, baseContents, contents }]);
  expect(await readFile(path.join(target.repoPath, target.relPath), "utf8")).toBe(external);

  current = fileEditorReducer(current, fileDocumentReloaded({ ...target, contents: external }));
  expect(serializeFileEditorDrafts(current)).toEqual([]);
  expect(current.documents[workingFileKey(target)]?.contents).toBe(external);
});
