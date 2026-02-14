import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'

import type { Bucket, FileItem, FileVersions, GitSnapshot, HistoryCommit } from './types'
import {
  commitStaged,
  discardFile,
  discardFiles,
  getCommitFiles,
  getCommitFileVersions,
  getCommitHistory,
  getFileVersions,
  getGitSnapshot,
  stageAll,
  stageFile,
  unstageAll,
  unstageFile,
} from './services/git'

type ErrorResult = { message: string }

type CommitHistoryArgs = { repoPath: string; limit?: number }
type CommitFilesArgs = { repoPath: string; commitId: string }
type CommitFileVersionsArgs = {
  repoPath: string
  commitId: string
  relPath: string
  previousPath?: string
}
type FileVersionsArgs = { repoPath: string; bucket: Bucket; relPath: string }

type StageFileArgs = { repoPath: string; relPath: string }
type UnstageFileArgs = { repoPath: string; relPath: string }
type DiscardFileArgs = { repoPath: string; relPath: string; bucket: Bucket }
type DiscardFilesArgs = { repoPath: string; files: Array<{ relPath: string; bucket: Bucket }> }
type CommitStagedArgs = { repoPath: string; message: string }

function toErrorResult(error: unknown): ErrorResult {
  return { message: error instanceof Error ? error.message : String(error) }
}

export const gitApi = createApi({
  reducerPath: 'gitApi',
  baseQuery: fakeBaseQuery<ErrorResult>(),
  tagTypes: ['Snapshot', 'HistoryCommits', 'HistoryFiles', 'FileVersions'],
  endpoints: (builder) => ({
    getGitSnapshot: builder.query<GitSnapshot, string>({
      async queryFn(repoPath) {
        try {
          return { data: await getGitSnapshot(repoPath) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      providesTags: (result, error, repoPath) => [{ type: 'Snapshot', id: repoPath }],
    }),
    getCommitHistory: builder.query<HistoryCommit[], CommitHistoryArgs>({
      async queryFn({ repoPath, limit }) {
        try {
          return { data: await getCommitHistory(repoPath, limit) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      providesTags: (result, error, { repoPath }) => [{ type: 'HistoryCommits', id: repoPath }],
    }),
    getCommitFiles: builder.query<FileItem[], CommitFilesArgs>({
      async queryFn({ repoPath, commitId }) {
        try {
          return { data: await getCommitFiles(repoPath, commitId) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      providesTags: (result, error, { repoPath, commitId }) => [
        { type: 'HistoryFiles', id: `${repoPath}:${commitId}` },
      ],
    }),
    getCommitFileVersions: builder.query<FileVersions, CommitFileVersionsArgs>({
      async queryFn({ repoPath, commitId, relPath, previousPath }) {
        try {
          return { data: await getCommitFileVersions(repoPath, commitId, relPath, previousPath) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      providesTags: (result, error, { repoPath, commitId, relPath }) => [
        { type: 'FileVersions', id: `history:${repoPath}:${commitId}:${relPath}` },
      ],
    }),
    getFileVersions: builder.query<FileVersions, FileVersionsArgs>({
      async queryFn({ repoPath, bucket, relPath }) {
        try {
          return { data: await getFileVersions(repoPath, bucket, relPath) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      providesTags: (result, error, { repoPath, relPath }) => [
        { type: 'FileVersions', id: `${repoPath}:${relPath}` },
      ],
    }),
    stageFile: builder.mutation<void, StageFileArgs>({
      async queryFn({ repoPath, relPath }) {
        try {
          await stageFile(repoPath, relPath)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath, relPath }) => [
        { type: 'Snapshot', id: repoPath },
        { type: 'FileVersions', id: `${repoPath}:${relPath}` },
      ],
    }),
    unstageFile: builder.mutation<void, UnstageFileArgs>({
      async queryFn({ repoPath, relPath }) {
        try {
          await unstageFile(repoPath, relPath)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath, relPath }) => [
        { type: 'Snapshot', id: repoPath },
        { type: 'FileVersions', id: `${repoPath}:${relPath}` },
      ],
    }),
    discardFile: builder.mutation<void, DiscardFileArgs>({
      async queryFn({ repoPath, relPath, bucket }) {
        try {
          await discardFile(repoPath, relPath, bucket)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath, relPath }) => [
        { type: 'Snapshot', id: repoPath },
        { type: 'FileVersions', id: `${repoPath}:${relPath}` },
      ],
    }),
    discardFiles: builder.mutation<void, DiscardFilesArgs>({
      async queryFn({ repoPath, files }) {
        try {
          await discardFiles(repoPath, files)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath }) => [{ type: 'Snapshot', id: repoPath }],
    }),
    stageAll: builder.mutation<void, { repoPath: string }>({
      async queryFn({ repoPath }) {
        try {
          await stageAll(repoPath)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath }) => [{ type: 'Snapshot', id: repoPath }],
    }),
    unstageAll: builder.mutation<void, { repoPath: string }>({
      async queryFn({ repoPath }) {
        try {
          await unstageAll(repoPath)
          return { data: undefined }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath }) => [{ type: 'Snapshot', id: repoPath }],
    }),
    commitStaged: builder.mutation<string, CommitStagedArgs>({
      async queryFn({ repoPath, message }) {
        try {
          return { data: await commitStaged(repoPath, message) }
        } catch (error) {
          return { error: toErrorResult(error) }
        }
      },
      invalidatesTags: (result, error, { repoPath }) => [
        { type: 'Snapshot', id: repoPath },
        { type: 'HistoryCommits', id: repoPath },
      ],
    }),
  }),
})

export const {
  useGetGitSnapshotQuery,
  useGetCommitHistoryQuery,
  useGetCommitFilesQuery,
  useGetCommitFileVersionsQuery,
  useGetFileVersionsQuery,
} = gitApi
