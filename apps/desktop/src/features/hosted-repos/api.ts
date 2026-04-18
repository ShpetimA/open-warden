import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  AddPullRequestCommentInput,
  ConnectProviderInput,
  HostedRepoRef,
  ListPullRequestsInput,
  ProviderConnection,
  PullRequestChangedFile,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestLocatorInput,
  PullRequestPage,
  PullRequestReviewThread,
  PullRequestSummary,
  ReplyToPullRequestThreadInput,
  ResolveActivePullRequestForBranchInput,
  SetPullRequestThreadResolvedInput,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
} from "@/platform/desktop";
import {
  addPullRequestComment,
  connectProvider,
  disconnectProvider,
  getPullRequestConversation,
  getPullRequestFiles,
  getPullRequestPatch,
  listProviderConnections,
  listPullRequests,
  resolveActivePullRequestForBranch,
  preparePullRequestCompareRefs,
  replyToPullRequestThread,
  resolveHostedRepo,
  setPullRequestThreadResolved,
  submitPullRequestReviewComments,
} from "./services/hostedRepos";

type ErrorResult = { message: string };

function toErrorResult(error: unknown): ErrorResult {
  return { message: error instanceof Error ? error.message : String(error) };
}

export const hostedReposApi = createApi({
  reducerPath: "hostedReposApi",
  baseQuery: fakeBaseQuery<ErrorResult>(),
  tagTypes: [
    "ProviderConnections",
    "HostedRepo",
    "PullRequests",
    "PullRequestConversation",
    "PullRequestFiles",
    "PullRequestPatch",
    "PullRequestCompareRefs",
  ],
  endpoints: (builder) => ({
    listProviderConnections: builder.query<ProviderConnection[], void>({
      async queryFn() {
        try {
          return { data: await listProviderConnections() };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: ["ProviderConnections"],
    }),
    connectProvider: builder.mutation<ProviderConnection, ConnectProviderInput>({
      async queryFn(input) {
        try {
          return { data: await connectProvider(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: ["ProviderConnections", "PullRequests"],
    }),
    disconnectProvider: builder.mutation<void, ProviderConnection["providerId"]>({
      async queryFn(providerId) {
        try {
          await disconnectProvider(providerId);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: ["ProviderConnections", "PullRequests"],
    }),
    resolveHostedRepo: builder.query<HostedRepoRef | null, string>({
      async queryFn(repoPath) {
        try {
          return { data: await resolveHostedRepo(repoPath) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, repoPath) => [{ type: "HostedRepo", id: repoPath }],
    }),
    listPullRequests: builder.query<PullRequestPage, ListPullRequestsInput>({
      async queryFn(input) {
        try {
          return { data: await listPullRequests(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "PullRequests", id: repoPath }],
    }),
    resolveActivePullRequestForBranch: builder.query<
      PullRequestSummary | null,
      ResolveActivePullRequestForBranchInput
    >({
      async queryFn(input) {
        try {
          return { data: await resolveActivePullRequestForBranch(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, branch }) => [
        { type: "PullRequests", id: `${repoPath}:active:${branch}` },
      ],
    }),
    getPullRequestConversation: builder.query<PullRequestConversation, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestConversation(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestFiles: builder.query<PullRequestChangedFile[], PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestFiles(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestFiles", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestPatch: builder.query<string, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestPatch(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestPatch", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    preparePullRequestCompareRefs: builder.query<PullRequestCompareRefs, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await preparePullRequestCompareRefs(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestCompareRefs", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    addPullRequestComment: builder.mutation<void, AddPullRequestCommentInput>({
      async queryFn(input) {
        try {
          await addPullRequestComment(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    replyToPullRequestThread: builder.mutation<
      PullRequestReviewThread,
      ReplyToPullRequestThreadInput
    >({
      async queryFn(input) {
        try {
          return { data: await replyToPullRequestThread(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    submitPullRequestReviewComments: builder.mutation<
      SubmitPullRequestReviewCommentsResult,
      SubmitPullRequestReviewCommentsInput
    >({
      async queryFn(input) {
        try {
          return { data: await submitPullRequestReviewComments(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    setPullRequestThreadResolved: builder.mutation<
      PullRequestReviewThread,
      SetPullRequestThreadResolvedInput
    >({
      async queryFn(input) {
        try {
          return { data: await setPullRequestThreadResolved(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
  }),
});

export const {
  useConnectProviderMutation,
  useAddPullRequestCommentMutation,
  useDisconnectProviderMutation,
  useGetPullRequestConversationQuery,
  useGetPullRequestFilesQuery,
  useGetPullRequestPatchQuery,
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  usePreparePullRequestCompareRefsQuery,
  useReplyToPullRequestThreadMutation,
  useResolveHostedRepoQuery,
  useResolveActivePullRequestForBranchQuery,
  useSetPullRequestThreadResolvedMutation,
  useSubmitPullRequestReviewCommentsMutation,
} = hostedReposApi;
