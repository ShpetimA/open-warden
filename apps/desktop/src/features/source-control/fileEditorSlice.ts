import { repositoryEntryTrashed } from "./sourceControlSlice";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DesktopFailure } from "@/platform/desktop/failure";

export type WorkingFileTarget = { repoPath: string; relPath: string };
type SaveState =
  | { kind: "idle" }
  | { kind: "saving"; contents: string }
  | { kind: "failed"; error: DesktopFailure };
export type FileDocument = WorkingFileTarget & {
  baseContents: string;
  contents: string;
  resetVersion: number;
  save: SaveState;
};
type FileEditorState = {
  documents: Record<string, FileDocument | undefined>;
  trashing: Array<{ repoPath: string; path: string }>;
};
const initialState: FileEditorState = { documents: {}, trashing: [] };

export function isWorkingFileTrashing(state: FileEditorState, target: WorkingFileTarget) {
  return state.trashing.some(
    (entry) =>
      entry.repoPath === target.repoPath &&
      (target.relPath === entry.path || target.relPath.startsWith(`${entry.path}/`)),
  );
}

export function workingFileKey(target: WorkingFileTarget) {
  return JSON.stringify([target.repoPath, target.relPath]);
}

const slice = createSlice({
  name: "fileEditor",
  initialState,
  reducers: {
    fileTrashStarted(state, { payload }: PayloadAction<{ repoPath: string; path: string }>) {
      state.trashing.push(payload);
    },
    fileTrashFinished(state, { payload }: PayloadAction<{ repoPath: string; path: string }>) {
      state.trashing = state.trashing.filter(
        (entry) => entry.repoPath !== payload.repoPath || entry.path !== payload.path,
      );
    },
    fileDocumentOpened(
      state,
      { payload }: PayloadAction<WorkingFileTarget & { contents: string }>,
    ) {
      const key = workingFileKey(payload);
      const existing = state.documents[key];
      if (
        existing &&
        (existing.contents !== existing.baseContents || existing.save.kind === "saving")
      )
        return;
      state.documents[key] = {
        ...payload,
        baseContents: payload.contents,
        save: { kind: "idle" },
        resetVersion: existing?.resetVersion ?? 0,
      };
    },
    fileDocumentChanged(
      state,
      { payload }: PayloadAction<WorkingFileTarget & { contents: string; baseContents: string }>,
    ) {
      const key = workingFileKey(payload);
      const existing = state.documents[key];
      if (existing) {
        existing.contents = payload.contents;
        if (existing.save.kind === "failed") existing.save = { kind: "idle" };
      } else {
        state.documents[key] = { ...payload, save: { kind: "idle" }, resetVersion: 0 };
      }
    },
    fileSaveStarted(state, { payload }: PayloadAction<WorkingFileTarget>) {
      const entry = state.documents[workingFileKey(payload)];
      if (entry) entry.save = { kind: "saving", contents: entry.contents };
    },
    fileSaveSucceeded(state, { payload }: PayloadAction<WorkingFileTarget & { contents: string }>) {
      const entry = state.documents[workingFileKey(payload)];
      if (!entry) return;
      entry.baseContents = payload.contents;
      entry.save = { kind: "idle" };
    },
    fileSaveFailed(
      state,
      { payload }: PayloadAction<WorkingFileTarget & { error: DesktopFailure }>,
    ) {
      const entry = state.documents[workingFileKey(payload)];
      if (entry) entry.save = { kind: "failed", error: payload.error };
    },
    fileDocumentReloaded(
      state,
      { payload }: PayloadAction<WorkingFileTarget & { contents: string }>,
    ) {
      const key = workingFileKey(payload);
      state.documents[key] = {
        ...payload,
        baseContents: payload.contents,
        save: { kind: "idle" },
        resetVersion: (state.documents[key]?.resetVersion ?? 0) + 1,
      };
    },
    fileDocumentClosed(state, { payload }: PayloadAction<WorkingFileTarget>) {
      const key = workingFileKey(payload);
      const entry = state.documents[key];
      if (entry && entry.contents === entry.baseContents && entry.save.kind !== "saving")
        delete state.documents[key];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(repositoryEntryTrashed, (state, { payload }) => {
      for (const [key, document] of Object.entries(state.documents)) {
        if (
          document?.repoPath === payload.repoPath &&
          (document.relPath === payload.path || document.relPath.startsWith(`${payload.path}/`))
        ) {
          delete state.documents[key];
        }
      }
    });
  },
});

export const {
  fileTrashStarted,
  fileTrashFinished,
  fileDocumentOpened,
  fileDocumentChanged,
  fileSaveStarted,
  fileSaveSucceeded,
  fileSaveFailed,
  fileDocumentReloaded,
  fileDocumentClosed,
} = slice.actions;
export const fileEditorReducer = slice.reducer;
