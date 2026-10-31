import { hasRepositoryEventBridge } from "./repositoryFreshness";
import type { DiffEditExpectation, FileEditExpectation } from "@/platform/desktop/fileEdits";
import type { RepositoryEntryPathInput, RepositoryEntry } from "@/platform/desktop/contracts";
import { historyGraphSchema } from "@/platform/desktop/history";
import { buildHistoryGraph, type HistoryGraphViewData } from "./historyGraph";
import { desktop } from "@/platform/desktop";
import {
  queryResult,
  desktopFailure,
  type DesktopFailure,
  type DesktopResult,
} from "@/platform/desktop/failure";
import { type ZodType } from "zod";
import {
  fileContentSchema,
  fileVersionsSchema,
  type FileContent,
} from "@/platform/desktop/fileContent";
import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  Bucket,
  FileItem,
  FileVersions,
  GitSnapshot,
  HistoryCommit,
  RepoFileItem,
} from "./types";
import type { CommitDetails, GitBlameResult } from "@/platform/desktop";
import {
  getBranches,
  getBranchFiles,
  getBranchFileVersions,
  commitStaged,
  discardFile,
  discardFiles,
  getCommitFiles,
  getCommitFileVersions,
  getCommitHistory,
  getCommitDetails,
  getBranchCommits,
  getFileVersions,
  getRepoFiles,
  getRepoFile,
  getGitSnapshot,
  stageAll,
  stageFile,
  stageFiles,
  unstageAll,
  unstageFile,
  unstageFiles,
  updateIndexFileContents,
  updateWorktreeFileContents,
} from "./services/git";

type CommitHistoryArgs = { repoPath: string; limit?: number };
type BranchFilesArgs = { repoPath: string; baseRef: string; headRef: string };
type CommitFilesArgs = { repoPath: string; commitId: string };
type RepoFileArgs = { repoPath: string; relPath: string; revision?: string | null };
type CommitFileVersionsArgs = {
  repoPath: string;
  commitId: string;
  relPath: string;
  previousPath?: string;
};
type FileVersionsArgs = {
  repoPath: string;
  bucket: Bucket;
  relPath: string;
  previousPath: string | null;
};
type BranchFileVersionsArgs = {
  repoPath: string;
  baseRef: string;
  headRef: string;
  relPath: string;
  previousPath?: string;
};

type StageFileArgs = { repoPath: string; relPath: string };
type UnstageFileArgs = { repoPath: string; relPath: string };
type IndexFilesArgs = { repoPath: string; relPaths: readonly string[] };
type UpdateIndexFileContentsArgs = {
  repoPath: string;
  relPath: string;
  contents: string;
  expected: DiffEditExpectation;
};
type UpdateWorktreeFileContentsArgs = {
  repoPath: string;
  relPath: string;
  contents: string;
  expected: FileEditExpectation;
};
type SaveWorkingFileArgs = {
  repoPath: string;
  relPath: string;
  contents: string;
  expectedContents: string;
};
type DiscardFileArgs = { repoPath: string; relPath: string; bucket: Bucket };
type DiscardFilesArgs = { repoPath: string; files: Array<{ relPath: string; bucket: Bucket }> };
type CommitStagedArgs = { repoPath: string; message: string };

function normalizeFilePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\/+/, "");
}

function parseFileRead<T>(result: DesktopResult<unknown>, schema: ZodType<T>, operation: string) {
  if (!result.ok) return { error: result.error };

  const parsed = schema.safeParse(result.value);

  if (!parsed.success) {
    return {
      error: desktopFailure(
        operation,
        "unavailable",
        "The desktop service returned unreadable file data. Reload to try again.",
      ),
    };
  }

  return { data: parsed.data };
}

function normalizeFileItem(file: FileItem): FileItem {
  return {
    ...file,
    path: normalizeFilePath(file.path),
    previousPath: file.previousPath ? normalizeFilePath(file.previousPath) : file.previousPath,
  };
}

function normalizeRepoFileItem(file: RepoFileItem): RepoFileItem {
  return { ...file, path: normalizeFilePath(file.path) };
}

function normalizeGitSnapshot(snapshot: GitSnapshot): GitSnapshot {
  return {
    ...snapshot,
    unstaged: snapshot.unstaged.map(normalizeFileItem),
    staged: snapshot.staged.map(normalizeFileItem),
    untracked: snapshot.untracked.map(normalizeFileItem),
  };
}

export const gitApi = createApi({
  reducerPath: "gitApi",
  baseQuery: fakeBaseQuery<DesktopFailure>(),
  tagTypes: [
    "Snapshot",
    "RepoFiles",
    "HistoryCommits",
    "HistoryFiles",
    "CommitData",
    "Branches",
    "BranchFiles",
    "FileVersions",
    "WorkingVersions",
    "ComparisonVersions",
    "ComparedFiles",
    "RepositoryState",
  ],
  endpoints: (builder) => ({
    getGitSnapshot: builder.query<GitSnapshot, string>({
      async queryFn(repoPath) {
        return queryResult(await getGitSnapshot(repoPath), (value) => normalizeGitSnapshot(value));
      },
      providesTags: (_result, _error, repoPath) => [{ type: "Snapshot", id: repoPath }],
    }),
    createRepositoryEntry: builder.mutation<RepositoryEntry, RepositoryEntryPathInput>({
      async queryFn(input) {
        return queryResult(await desktop.createRepositoryEntry(input));
      },
      invalidatesTags: (entry, error, { repoPath }) =>
        hasRepositoryEventBridge() || error
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "RepoFiles", id: repoPath },
              ...(entry?.kind === "file"
                ? [
                    {
                      type: "FileVersions" as const,
                      id: `file:${repoPath}:worktree:${entry.path}`,
                    },
                  ]
                : []),
            ],
    }),
    trashRepositoryEntry: builder.mutation<void, RepositoryEntryPathInput>({
      async queryFn(input) {
        return queryResult(await desktop.trashRepositoryEntry(input), () => undefined);
      },
      invalidatesTags: (_result, error, { repoPath }) =>
        hasRepositoryEventBridge() || error
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "RepoFiles", id: repoPath },
              "FileVersions",
            ],
    }),
    getRepoFiles: builder.query<RepoFileItem[], string>({
      async queryFn(repoPath) {
        return queryResult(await getRepoFiles(repoPath), (value) =>
          value.map(normalizeRepoFileItem),
        );
      },
      providesTags: (_result, _error, repoPath) => [{ type: "RepoFiles", id: repoPath }],
    }),
    getFileBlame: builder.query<GitBlameResult, RepoFileArgs>({
      async queryFn({ repoPath, relPath, revision }) {
        return queryResult(await desktop.getGitBlame(repoPath, relPath, revision));
      },
      providesTags: (_result, _error, { repoPath, relPath, revision }) =>
        revision
          ? []
          : [
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
              { type: "WorkingVersions", id: repoPath },
            ],
    }),
    getCommitHistory: builder.query<HistoryCommit[], CommitHistoryArgs>({
      async queryFn({ repoPath, limit }) {
        return queryResult(await getCommitHistory(repoPath, limit));
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "HistoryCommits", id: repoPath }],
    }),
    getHistoryGraph: builder.query<HistoryGraphViewData, string>({
      async queryFn(repoPath) {
        const result = await desktop.getHistoryGraph(repoPath);
        if (!result.ok) return { error: result.error };
        const parsed = historyGraphSchema.safeParse(result.value);
        return parsed.success
          ? { data: buildHistoryGraph(parsed.data) }
          : {
              error: desktopFailure(
                "getHistoryGraph",
                "unavailable",
                "The history graph could not be read. Try refreshing the repository.",
              ),
            };
      },
      providesTags: (_data, _error, repoPath) => [{ type: "HistoryCommits", id: repoPath }],
    }),
    getCommitDetails: builder.query<CommitDetails, CommitFilesArgs>({
      async queryFn({ repoPath, commitId }) {
        return queryResult(await getCommitDetails(repoPath, commitId));
      },
      providesTags: (_result, _error, { repoPath, commitId }) => [
        { type: "CommitData", id: repoPath },
        ...(/^[a-f0-9]{40,64}$/.test(commitId)
          ? []
          : [{ type: "HistoryCommits" as const, id: repoPath }]),
      ],
    }),
    getBranches: builder.query<string[], string>({
      async queryFn(repoPath) {
        return queryResult(await getBranches(repoPath));
      },
      providesTags: (_result, _error, repoPath) => [{ type: "Branches", id: repoPath }],
    }),
    getBranchCommits: builder.query<HistoryCommit[], BranchFilesArgs>({
      async queryFn({ repoPath, baseRef, headRef }) {
        return queryResult(await getBranchCommits(repoPath, baseRef, headRef));
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "HistoryCommits", id: repoPath }],
    }),
    getBranchFiles: builder.query<FileItem[], BranchFilesArgs>({
      async queryFn({ repoPath, baseRef, headRef }) {
        return queryResult(await getBranchFiles(repoPath, baseRef, headRef), (value) =>
          value.map(normalizeFileItem),
        );
      },
      providesTags: (_result, _error, { repoPath, baseRef, headRef }) => [
        { type: "BranchFiles", id: `${repoPath}:${baseRef}:${headRef}` },
        { type: "ComparedFiles", id: repoPath },
      ],
    }),
    getCommitFiles: builder.query<FileItem[], CommitFilesArgs>({
      async queryFn({ repoPath, commitId }) {
        return queryResult(await getCommitFiles(repoPath, commitId), (value) =>
          value.map(normalizeFileItem),
        );
      },
      providesTags: (_result, _error, { repoPath, commitId }) => [
        { type: "HistoryFiles", id: `${repoPath}:${commitId}` },
        { type: "CommitData", id: repoPath },
      ],
    }),
    getRepoFile: builder.query<FileContent | null, RepoFileArgs>({
      async queryFn({ repoPath, relPath, revision }) {
        return parseFileRead(
          await getRepoFile(repoPath, relPath, revision),
          fileContentSchema.nullable(),
          "getRepoFile",
        );
      },
      providesTags: (_result, _error, { repoPath, relPath, revision }) => [
        { type: "FileVersions", id: `file:${repoPath}:${revision ?? "worktree"}:${relPath}` },
        { type: revision ? "ComparisonVersions" : "WorkingVersions", id: repoPath },
      ],
    }),
    getCommitFileVersions: builder.query<FileVersions, CommitFileVersionsArgs>({
      async queryFn({ repoPath, commitId, relPath, previousPath }) {
        return parseFileRead(
          await getCommitFileVersions(repoPath, commitId, relPath, previousPath),
          fileVersionsSchema,
          "getCommitFileVersions",
        );
      },
      providesTags: (_result, _error, { repoPath, commitId, relPath }) => [
        { type: "FileVersions", id: `history:${repoPath}:${commitId}:${relPath}` },
        { type: "CommitData", id: repoPath },
      ],
    }),
    getFileVersions: builder.query<FileVersions, FileVersionsArgs>({
      async queryFn({ repoPath, bucket, relPath, previousPath }) {
        return parseFileRead(
          await getFileVersions(repoPath, bucket, relPath, previousPath),
          fileVersionsSchema,
          "getFileVersions",
        );
      },
      providesTags: (_result, _error, { repoPath, relPath }) => [
        { type: "FileVersions", id: `${repoPath}:${relPath}` },
        { type: "WorkingVersions", id: repoPath },
      ],
    }),
    getBranchFileVersions: builder.query<FileVersions, BranchFileVersionsArgs>({
      async queryFn({ repoPath, baseRef, headRef, relPath, previousPath }) {
        return parseFileRead(
          await getBranchFileVersions(repoPath, baseRef, headRef, relPath, previousPath),
          fileVersionsSchema,
          "getBranchFileVersions",
        );
      },
      providesTags: (_result, _error, { repoPath, baseRef, headRef, relPath }) => [
        { type: "FileVersions", id: `branch:${repoPath}:${baseRef}:${headRef}:${relPath}` },
        { type: "ComparisonVersions", id: repoPath },
      ],
    }),
    stageFile: builder.mutation<void, StageFileArgs>({
      async queryFn({ repoPath, relPath }) {
        return queryResult(await stageFile(repoPath, relPath), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
            ],
    }),
    stageFiles: builder.mutation<void, IndexFilesArgs>({
      async queryFn({ repoPath, relPaths }) {
        return queryResult(await stageFiles(repoPath, relPaths), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, relPaths }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              ...relPaths.map((path) => ({
                type: "FileVersions" as const,
                id: `${repoPath}:${path}`,
              })),
            ],
    }),
    unstageFile: builder.mutation<void, UnstageFileArgs>({
      async queryFn({ repoPath, relPath }) {
        return queryResult(await unstageFile(repoPath, relPath), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
            ],
    }),
    unstageFiles: builder.mutation<void, IndexFilesArgs>({
      async queryFn({ repoPath, relPaths }) {
        return queryResult(await unstageFiles(repoPath, relPaths), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, relPaths }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              ...relPaths.map((path) => ({
                type: "FileVersions" as const,
                id: `${repoPath}:${path}`,
              })),
            ],
    }),
    updateIndexFileContents: builder.mutation<void, UpdateIndexFileContentsArgs>({
      async queryFn({ repoPath, relPath, contents, expected }) {
        return queryResult(
          await updateIndexFileContents(repoPath, relPath, contents, expected),
          () => undefined,
        );
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
            ],
    }),
    saveWorkingFile: builder.mutation<void, SaveWorkingFileArgs>({
      async queryFn({ repoPath, relPath, contents, expectedContents }) {
        return queryResult(
          await updateWorktreeFileContents(repoPath, relPath, contents, {
            kind: "worktree",
            contents: expectedContents,
          }),
          () => undefined,
        );
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
              { type: "FileVersions", id: `file:${repoPath}:worktree:${relPath}` },
            ],
    }),
    updateWorktreeFileContents: builder.mutation<void, UpdateWorktreeFileContentsArgs>({
      async queryFn({ repoPath, relPath, contents, expected }) {
        return queryResult(
          await updateWorktreeFileContents(repoPath, relPath, contents, expected),
          () => undefined,
        );
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
              { type: "FileVersions", id: `file:${repoPath}:worktree:${relPath}` },
            ],
    }),
    discardFile: builder.mutation<void, DiscardFileArgs>({
      async queryFn({ repoPath, relPath, bucket }) {
        return queryResult(await discardFile(repoPath, relPath, bucket), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, relPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "FileVersions", id: `${repoPath}:${relPath}` },
            ],
    }),
    discardFiles: builder.mutation<void, DiscardFilesArgs>({
      async queryFn({ repoPath, files }) {
        return queryResult(await discardFiles(repoPath, files), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath }) =>
        hasRepositoryEventBridge() ? [] : [{ type: "Snapshot", id: repoPath }],
    }),
    stageAll: builder.mutation<void, { repoPath: string }>({
      async queryFn({ repoPath }) {
        return queryResult(await stageAll(repoPath), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath }) =>
        hasRepositoryEventBridge() ? [] : [{ type: "Snapshot", id: repoPath }],
    }),
    unstageAll: builder.mutation<void, { repoPath: string }>({
      async queryFn({ repoPath }) {
        return queryResult(await unstageAll(repoPath), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath }) =>
        hasRepositoryEventBridge() ? [] : [{ type: "Snapshot", id: repoPath }],
    }),
    commitStaged: builder.mutation<string, CommitStagedArgs>({
      async queryFn({ repoPath, message }) {
        return queryResult(await commitStaged(repoPath, message));
      },
      invalidatesTags: (_result, _error, { repoPath }) =>
        hasRepositoryEventBridge()
          ? []
          : [
              { type: "Snapshot", id: repoPath },
              { type: "HistoryCommits", id: repoPath },
            ],
    }),
  }),
});

export const {
  useGetGitSnapshotQuery,
  useGetRepoFilesQuery,
  useCreateRepositoryEntryMutation,
  useTrashRepositoryEntryMutation,
  useGetFileBlameQuery,
  useGetCommitHistoryQuery,
  useGetHistoryGraphQuery,
  useGetCommitDetailsQuery,
  useGetBranchCommitsQuery,
  useGetBranchesQuery,
  useGetBranchFilesQuery,
  useGetCommitFilesQuery,
  useGetRepoFileQuery,
  useGetCommitFileVersionsQuery,
  useGetFileVersionsQuery,
  useGetBranchFileVersionsQuery,
} = gitApi;
