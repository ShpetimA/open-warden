import { repositoryEntryTrashed } from "./sourceControlSlice";
import { expect, it } from "vitest";
import {
  fileDocumentChanged,
  fileDocumentClosed,
  fileDocumentOpened,
  fileDocumentReloaded,
  fileEditorReducer,
  fileSaveFailed,
  fileSaveStarted,
  fileSaveSucceeded,
  workingFileKey,
} from "./fileEditorSlice";

const target = { repoPath: "/repo", relPath: "src/main.ts" };
const key = workingFileKey(target);

it("keeps edits made while saving and uses the completed save as the next baseline", () => {
  let state = fileEditorReducer(undefined, fileDocumentOpened({ ...target, contents: "one" }));
  state = fileEditorReducer(
    state,
    fileDocumentChanged({ ...target, baseContents: "one", contents: "two" }),
  );
  state = fileEditorReducer(state, fileSaveStarted(target));
  state = fileEditorReducer(
    state,
    fileDocumentChanged({ ...target, baseContents: "one", contents: "three" }),
  );
  state = fileEditorReducer(state, fileSaveSucceeded({ ...target, contents: "two" }));
  expect(state.documents[key]).toMatchObject({
    baseContents: "two",
    contents: "three",
    save: { kind: "idle" },
  });
});

it("keeps an unsaved document when the file is reopened or a save fails", () => {
  let state = fileEditorReducer(
    undefined,
    fileDocumentChanged({ ...target, baseContents: "one", contents: "draft" }),
  );
  state = fileEditorReducer(state, fileDocumentOpened({ ...target, contents: "external change" }));
  state = fileEditorReducer(state, fileDocumentClosed(target));
  state = fileEditorReducer(
    state,
    fileSaveFailed({
      ...target,
      error: { operation: "saveWorkingFile", code: "permission", message: "Read only" },
    }),
  );
  expect(state.documents[key]).toMatchObject({
    baseContents: "one",
    contents: "draft",
    save: { kind: "failed" },
  });
  state = fileEditorReducer(
    state,
    fileDocumentReloaded({ ...target, contents: "external change" }),
  );
  expect(state.documents[key]).toMatchObject({
    baseContents: "external change",
    contents: "external change",
    resetVersion: 1,
    save: { kind: "idle" },
  });
  state = fileEditorReducer(state, fileDocumentClosed(target));
  expect(state.documents[key]).toBeUndefined();
});

it("clears discarded drafts only within the trashed repository entry", () => {
  let state = fileEditorReducer(
    undefined,
    fileDocumentOpened({ repoPath: "/repo", relPath: "src/file.ts", contents: "saved" }),
  );
  state = fileEditorReducer(
    state,
    fileDocumentChanged({
      repoPath: "/repo",
      relPath: "src/file.ts",
      baseContents: "saved",
      contents: "draft",
    }),
  );
  state = fileEditorReducer(
    state,
    fileDocumentOpened({ repoPath: "/other", relPath: "src/file.ts", contents: "other" }),
  );
  state = fileEditorReducer(
    state,
    fileDocumentOpened({ repoPath: "/repo", relPath: "src-sibling/file.ts", contents: "sibling" }),
  );
  state = fileEditorReducer(state, repositoryEntryTrashed({ repoPath: "/repo", path: "src" }));
  expect(Object.values(state.documents).map((document) => document?.contents)).toEqual([
    "other",
    "sibling",
  ]);
});
