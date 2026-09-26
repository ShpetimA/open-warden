import { createApi, fakeBaseQuery } from "@reduxjs/toolkit/query/react";

import type {
  AddPullRequestCommentInput,
  CreatePullRequestInput,
  ConnectProviderInput,
  HostedRepoRef,
  ListPullRequestsInput,
  MergePullRequestInput,
  ProviderConnection,
  PullRequestChangedFile,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestReviewOverview,
  PullRequestChecksResult,
  PullRequestExtras,
  SetPullRequestLabelsInput,
  RerunPullRequestWorkflowInput,
  AddPullRequestReactionInput,
  PullRequestLocatorInput,
  PullRequestLifecycleInput,
  PullRequestLifecycleResult,
  PullRequestActivity,
  PullRequestViewedFiles,
  SetPullRequestFileViewedInput,
  PullRequestPage,
  PullRequestReviewThread,
  PullRequestSummary,
  ReplyToPullRequestThreadInput,
  ResolveActivePullRequestForBranchInput,
  SetPullRequestThreadResolvedInput,
  SetPullRequestReviewerInput,
  SubmitPullRequestReviewInput,
  SubmitPullRequestReviewResult,
  SubmitPullRequestReviewCommentsInput,
  SubmitPullRequestReviewCommentsResult,
  SubmitPullRequestDecisionInput,
} from "@/platform/desktop";
import {
  addPullRequestComment,
  createPullRequest,
  connectProvider,
  disconnectProvider,
  getPullRequestConversation,
  getPullRequestReviewOverview,
  setPullRequestReviewer,
  submitPullRequestReview,
  runPullRequestLifecycle,
  getPullRequestActivity,
  getPullRequestViewedFiles,
  setPullRequestFileViewed,
  getPullRequestChecks,
  getPullRequestExtras,
  setPullRequestLabels,
  rerunPullRequestWorkflow,
  cancelPullRequestWorkflow,
  addPullRequestReaction,
  getPullRequestFiles,
  getPullRequestPatch,
  listProviderConnections,
  listPullRequests,
  mergePullRequest,
  resolveActivePullRequestForBranch,
  preparePullRequestCompareRefs,
  replyToPullRequestThread,
  resolveHostedRepo,
  setPullRequestThreadResolved,
  submitPullRequestReviewComments,
  submitPullRequestDecision,
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
    "PullRequestReviewOverview",
    "PullRequestActivity",
    "PullRequestViewedFiles",
    "PullRequestChecks",
    "PullRequestExtras",
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
    getPullRequestReviewOverview: builder.query<PullRequestReviewOverview, PullRequestLocatorInput>(
      {
        async queryFn(input) {
          try {
            return { data: await getPullRequestReviewOverview(input) };
          } catch (error) {
            return { error: toErrorResult(error) };
          }
        },
        providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
          { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        ],
      },
    ),
    setPullRequestReviewer: builder.mutation<void, SetPullRequestReviewerInput>({
      async queryFn(input) {
        try {
          await setPullRequestReviewer(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    submitPullRequestReview: builder.mutation<
      SubmitPullRequestReviewResult,
      SubmitPullRequestReviewInput
    >({
      async queryFn(input) {
        try {
          return { data: await submitPullRequestReview(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    runPullRequestLifecycle: builder.mutation<
      PullRequestLifecycleResult,
      PullRequestLifecycleInput
    >({
      async queryFn(input) {
        try {
          return { data: await runPullRequestLifecycle(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestChecks", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestActivity: builder.query<PullRequestActivity, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestActivity(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestViewedFiles: builder.query<PullRequestViewedFiles, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestViewedFiles(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestViewedFiles", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    setPullRequestFileViewed: builder.mutation<void, SetPullRequestFileViewedInput>({
      async queryFn(input) {
        try {
          await setPullRequestFileViewed(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestViewedFiles", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestChecks: builder.query<PullRequestChecksResult, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestChecks(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestChecks", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestExtras: builder.query<PullRequestExtras, PullRequestLocatorInput>({
      async queryFn(input) {
        try {
          return { data: await getPullRequestExtras(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    setPullRequestLabels: builder.mutation<void, SetPullRequestLabelsInput>({
      async queryFn(input) {
        try {
          await setPullRequestLabels(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    rerunPullRequestWorkflow: builder.mutation<void, RerunPullRequestWorkflowInput>({
      async queryFn(input) {
        try {
          await rerunPullRequestWorkflow(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestChecks", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    cancelPullRequestWorkflow: builder.mutation<void, RerunPullRequestWorkflowInput>({
      async queryFn(input) {
        try {
          await cancelPullRequestWorkflow(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestChecks", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    addPullRequestReaction: builder.mutation<void, AddPullRequestReactionInput>({
      async queryFn(input) {
        try {
          await addPullRequestReaction(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
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
    createPullRequest: builder.mutation<PullRequestSummary, CreatePullRequestInput>({
      async queryFn(input) {
        try {
          return { data: await createPullRequest(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath }) => [{ type: "PullRequests", id: repoPath }],
    }),
    submitPullRequestDecision: builder.mutation<void, SubmitPullRequestDecisionInput>({
      async queryFn(input) {
        try {
          await submitPullRequestDecision(input);
          return { data: undefined };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    mergePullRequest: builder.mutation<"merged" | "queued", MergePullRequestInput>({
      async queryFn(input) {
        try {
          return { data: await mergePullRequest(input) };
        } catch (error) {
          return { error: toErrorResult(error) };
        }
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestChecks", id: `${repoPath}:${String(pullRequestNumber)}` },
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
  useCreatePullRequestMutation,
  useSubmitPullRequestDecisionMutation,
  useMergePullRequestMutation,
  useDisconnectProviderMutation,
  useGetPullRequestConversationQuery,
  useGetPullRequestReviewOverviewQuery,
  useSetPullRequestReviewerMutation,
  useSubmitPullRequestReviewMutation,
  useRunPullRequestLifecycleMutation,
  useGetPullRequestActivityQuery,
  useGetPullRequestViewedFilesQuery,
  useSetPullRequestFileViewedMutation,
  useGetPullRequestChecksQuery,
  useGetPullRequestExtrasQuery,
  useSetPullRequestLabelsMutation,
  useRerunPullRequestWorkflowMutation,
  useCancelPullRequestWorkflowMutation,
  useAddPullRequestReactionMutation,
  useGetPullRequestFilesQuery,
  useGetPullRequestPatchQuery,
  useListProviderConnectionsQuery,
  useListPullRequestsQuery,
  usePreparePullRequestCompareRefsQuery,
  useLazyPreparePullRequestCompareRefsQuery,
  useReplyToPullRequestThreadMutation,
  useResolveHostedRepoQuery,
  useResolveActivePullRequestForBranchQuery,
  useSetPullRequestThreadResolvedMutation,
  useSubmitPullRequestReviewCommentsMutation,
} = hostedReposApi;
