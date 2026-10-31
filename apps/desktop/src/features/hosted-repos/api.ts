import { runHostedRead } from "./readPolicy";
import {
  queryResult,
  readDesktopFailure,
  failureFromUnknown,
  type DesktopFailure,
} from "@/platform/desktop/failure";
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

export type PullRequestFilesRead = Readonly<{
  files: PullRequestChangedFile[];
  headSha: string;
  baseSha: string;
}>;

export const hostedReposApi = createApi({
  reducerPath: "hostedReposApi",
  baseQuery: fakeBaseQuery<DesktopFailure>(),
  tagTypes: [
    "Guidance",
    "GuidanceConnection",
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
        return queryResult(await listProviderConnections());
      },
      providesTags: ["ProviderConnections"],
    }),
    connectProvider: builder.mutation<ProviderConnection, ConnectProviderInput>({
      async queryFn(input) {
        return queryResult(await connectProvider(input));
      },
      invalidatesTags: ["ProviderConnections", "PullRequests"],
    }),
    disconnectProvider: builder.mutation<void, ProviderConnection["providerId"]>({
      async queryFn(providerId) {
        return queryResult(await disconnectProvider(providerId), () => undefined);
      },
      invalidatesTags: ["ProviderConnections", "PullRequests"],
    }),
    resolveHostedRepo: builder.query<HostedRepoRef | null, string>({
      async queryFn(repoPath, api) {
        return runHostedRead(api, () => resolveHostedRepo(repoPath));
      },
      providesTags: (_result, _error, repoPath) => [{ type: "HostedRepo", id: repoPath }],
    }),
    listPullRequests: builder.query<PullRequestPage, ListPullRequestsInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => listPullRequests(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "PullRequests", id: repoPath }],
    }),
    resolveActivePullRequestForBranch: builder.query<
      PullRequestSummary | null,
      ResolveActivePullRequestForBranchInput
    >({
      async queryFn(input, api) {
        return runHostedRead(api, () => resolveActivePullRequestForBranch(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, branch }) => [
        { type: "PullRequests", id: `${repoPath}:active:${branch}` },
      ],
    }),
    getPullRequestConversation: builder.query<PullRequestConversation, PullRequestLocatorInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => getPullRequestConversation(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestReviewOverview: builder.query<PullRequestReviewOverview, PullRequestLocatorInput>(
      {
        async queryFn(input, api) {
          return runHostedRead(api, () => getPullRequestReviewOverview(input), input.repoPath);
        },
        providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
          { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        ],
      },
    ),
    setPullRequestReviewer: builder.mutation<void, SetPullRequestReviewerInput>({
      async queryFn(input) {
        return queryResult(await setPullRequestReviewer(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    submitPullRequestReview: builder.mutation<
      SubmitPullRequestReviewResult,
      SubmitPullRequestReviewInput
    >({
      async queryFn(input) {
        return queryResult(await submitPullRequestReview(input));
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    runPullRequestLifecycle: builder.mutation<
      PullRequestLifecycleResult,
      PullRequestLifecycleInput
    >({
      async queryFn(input) {
        return queryResult(await runPullRequestLifecycle(input));
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
      async queryFn(input, api) {
        return runHostedRead(api, () => getPullRequestActivity(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestViewedFiles: builder.query<PullRequestViewedFiles, PullRequestLocatorInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => getPullRequestViewedFiles(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestViewedFiles", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    setPullRequestFileViewed: builder.mutation<void, SetPullRequestFileViewedInput>({
      async queryFn(input) {
        return queryResult(await setPullRequestFileViewed(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestViewedFiles", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestChecks: builder.query<
      PullRequestChecksResult & { baseSha: string },
      PullRequestLocatorInput
    >({
      async queryFn(
        input,
        api,
      ): Promise<
        { data: PullRequestChecksResult & { baseSha: string } } | { error: DesktopFailure }
      > {
        const conversation = await api.dispatch(
          hostedReposApi.endpoints.getPullRequestConversation.initiate(input, { subscribe: false }),
        );
        if (conversation.error || !conversation.data)
          return {
            error:
              readDesktopFailure(conversation.error) ??
              failureFromUnknown(conversation.error, "getPullRequestChecks"),
          };
        const result = await runHostedRead(api, () => getPullRequestChecks(input), input.repoPath);
        if ("error" in result) return result;
        return { data: { ...result.data, baseSha: conversation.data.detail.baseSha } };
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestChecks", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestExtras: builder.query<PullRequestExtras, PullRequestLocatorInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => getPullRequestExtras(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    setPullRequestLabels: builder.mutation<void, SetPullRequestLabelsInput>({
      async queryFn(input) {
        return queryResult(await setPullRequestLabels(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    rerunPullRequestWorkflow: builder.mutation<void, RerunPullRequestWorkflowInput>({
      async queryFn(input) {
        return queryResult(await rerunPullRequestWorkflow(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestChecks", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    cancelPullRequestWorkflow: builder.mutation<void, RerunPullRequestWorkflowInput>({
      async queryFn(input) {
        return queryResult(await cancelPullRequestWorkflow(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestExtras", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestChecks", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    addPullRequestReaction: builder.mutation<void, AddPullRequestReactionInput>({
      async queryFn(input) {
        return queryResult(await addPullRequestReaction(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    getPullRequestFiles: builder.query<PullRequestFilesRead, PullRequestLocatorInput>({
      async queryFn(
        input,
        api,
      ): Promise<{ data: PullRequestFilesRead } | { error: DesktopFailure }> {
        const conversation = await api.dispatch(
          hostedReposApi.endpoints.getPullRequestConversation.initiate(input, { subscribe: false }),
        );
        if (conversation.error || !conversation.data)
          return {
            error:
              readDesktopFailure(conversation.error) ??
              failureFromUnknown(conversation.error, "getPullRequestFiles"),
          };
        const result = await runHostedRead(api, () => getPullRequestFiles(input), input.repoPath);
        if ("error" in result) return result;
        return {
          data: {
            files: result.data,
            headSha: conversation.data.detail.headSha,
            baseSha: conversation.data.detail.baseSha,
          },
        };
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestFiles", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    getPullRequestPatch: builder.query<string, PullRequestLocatorInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => getPullRequestPatch(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestPatch", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    preparePullRequestCompareRefs: builder.query<PullRequestCompareRefs, PullRequestLocatorInput>({
      async queryFn(input, api) {
        return runHostedRead(api, () => preparePullRequestCompareRefs(input), input.repoPath);
      },
      providesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestCompareRefs", id: `${repoPath}:${String(pullRequestNumber)}` },
      ],
    }),
    addPullRequestComment: builder.mutation<void, AddPullRequestCommentInput>({
      async queryFn(input) {
        return queryResult(await addPullRequestComment(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    createPullRequest: builder.mutation<PullRequestSummary, CreatePullRequestInput>({
      async queryFn(input) {
        return queryResult(await createPullRequest(input));
      },
      invalidatesTags: (_result, _error, { repoPath }) => [{ type: "PullRequests", id: repoPath }],
    }),
    submitPullRequestDecision: builder.mutation<void, SubmitPullRequestDecisionInput>({
      async queryFn(input) {
        return queryResult(await submitPullRequestDecision(input), () => undefined);
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestReviewOverview", id: `${repoPath}:${pullRequestNumber}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    mergePullRequest: builder.mutation<"merged" | "queued", MergePullRequestInput>({
      async queryFn(input) {
        return queryResult(await mergePullRequest(input));
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestChecks", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    replyToPullRequestThread: builder.mutation<
      PullRequestReviewThread,
      ReplyToPullRequestThreadInput
    >({
      async queryFn(input) {
        return queryResult(await replyToPullRequestThread(input));
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    submitPullRequestReviewComments: builder.mutation<
      SubmitPullRequestReviewCommentsResult,
      SubmitPullRequestReviewCommentsInput
    >({
      async queryFn(input) {
        return queryResult(await submitPullRequestReviewComments(input));
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequests", id: repoPath },
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
      ],
    }),
    setPullRequestThreadResolved: builder.mutation<
      PullRequestReviewThread,
      SetPullRequestThreadResolvedInput
    >({
      async queryFn(input) {
        return queryResult(await setPullRequestThreadResolved(input));
      },
      invalidatesTags: (_result, _error, { repoPath, pullRequestNumber }) => [
        { type: "PullRequestConversation", id: `${repoPath}:${String(pullRequestNumber)}` },
        { type: "PullRequestActivity", id: `${repoPath}:${pullRequestNumber}` },
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
