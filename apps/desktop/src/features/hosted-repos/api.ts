import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  AddPullRequestCommentInput,
  ConnectProviderInput,
  HostedRepoRef,
  ProviderConnection,
  PullRequestConversation,
  PullRequestLocatorInput,
  PullRequestReviewThread,
  PullRequestSummary,
  ReplyToPullRequestThreadInput,
  SetPullRequestThreadResolvedInput,
  PreparedPullRequestWorkspace,
} from "@/platform/desktop";
import {
  addPullRequestComment,
  connectProvider,
  disconnectProvider,
  getPullRequestConversation,
  listProviderConnections,
  listPullRequests,
  replyToPullRequestThread,
  resolveHostedRepo,
  resolvePullRequestWorkspace,
  setPullRequestThreadResolved,
} from "./services/hostedRepos";

type ErrorResult = { message: string };

function toErrorResult(error: unknown): ErrorResult {
  return { message: error instanceof Error ? error.message : String(error) };
}

export const hostedReposApi = createApi({
  reducerPath: "hostedReposApi",
  baseQuery: fakeBaseQuery<ErrorResult>(),
  tagTypes: ["ProviderConnections", "HostedRepo", "PullRequests", "PullRequestConversation"],
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
    resolvePullRequestWorkspace: builder.query<PreparedPullRequestWorkspace | null, string>({
      async queryFn(repoPath) {
        try {
          return { data: await resolvePullRequestWorkspace(repoPath) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, repoPath) => [
        { type: "HostedRepo", id: `${repoPath}:pull-request-workspace` },
      ],
    }),
    listPullRequests: builder.query<PullRequestSummary[], string>({
      async queryFn(repoPath) {
        try {
          return { data: await listPullRequests(repoPath) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, repoPath) => [{ type: "PullRequests", id: repoPath }],
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
    replyToPullRequestThread: builder.mutation<PullRequestReviewThread, ReplyToPullRequestThreadInput>({
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
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  useReplyToPullRequestThreadMutation,
  useResolveHostedRepoQuery,
  useResolvePullRequestWorkspaceQuery,
  useSetPullRequestThreadResolvedMutation,
} = hostedReposApi;
