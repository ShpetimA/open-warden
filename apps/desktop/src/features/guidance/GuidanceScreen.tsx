import { skipToken } from "@reduxjs/toolkit/query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BookOpen, Settings2 } from "lucide-react";
import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import {
  useGetPullRequestConversationQuery,
  useResolveHostedRepoQuery,
} from "@/features/hosted-repos/api";
import { usePullRequestComparison } from "@/features/pull-requests/hooks/usePullRequestComparison";
import { useGetBranchFileVersionsQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { GuidanceLocator, GuidanceReference, GuidanceStep } from "@/platform/desktop/guidance";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { buildPullRequestAnchorAnnotations } from "@/features/pull-requests/utils/reviewAnchors";
import ReviewCommentsCopyToolbar from "@/features/pull-requests/components/ReviewCopyBar";
import type { DiffAnnotationItem } from "@/features/source-control/types";
import type { DiffLineAnnotation } from "@pierre/diffs";
import {
  useGetPullRequestGuidanceQuery,
  useSetGuidanceProgressMutation,
  useAddGuidanceMessageMutation,
} from "./api";
import { GuidanceView } from "./GuidanceView";
import { GuidanceActivityStatus } from "./GuidanceActivityStatus";
import { useGetGuidanceActivityQuery, useClearGuidanceMessagesMutation } from "./api";

export function GuidanceScreen() {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const params = useParams();
  const number = Number(params.pullRequestNumber);
  const {
    hosted,
    loading: resolving,
    error: remoteError,
  } = useResolveHostedRepoQuery(repoPath || skipToken, {
    selectFromResult: ({ currentData, isFetching, error }) => ({
      hosted: currentData,
      loading: isFetching && !currentData,
      error,
    }),
  });
  const matches =
    hosted &&
    hosted.providerId === params.providerId &&
    hosted.owner === params.owner &&
    hosted.repo === params.repo;
  const locator =
    matches && Number.isInteger(number) && number > 0
      ? { repoPath, pullRequestNumber: number }
      : null;
  if (resolving) return <ListLoadingState label="Loading walkthrough…" />;
  if (remoteError)
    return (
      <p role="alert" className="text-destructive p-6">
        {errorMessageFrom(remoteError, "The repository could not be resolved.")}
      </p>
    );
  if (!locator)
    return (
      <p className="text-muted-foreground p-6">
        Open the matching repository to view this walkthrough.
      </p>
    );
  return <GuidanceController key={`${repoPath}:${number}`} locator={locator} />;
}

function GuidanceController({ locator }: { locator: GuidanceLocator }) {
  const navigate = useNavigate();
  const { data: activity = null } = useGetGuidanceActivityQuery(locator, {
    pollingInterval: 1000,
    refetchOnFocus: true,
  });
  const {
    data: guide,
    isLoading,
    error: loadError,
  } = useGetPullRequestGuidanceQuery(locator, { pollingInterval: 1000, refetchOnFocus: true });
  const {
    detail,
    loading: loadingHead,
    error: headError,
  } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData, isFetching, error }) => ({
      detail: currentData?.detail,
      loading: isFetching && !currentData,
      error,
    }),
    pollingInterval: 10000,
    refetchOnFocus: true,
  });
  const stale = !!guide && (!detail || detail.headSha !== guide.headSha);
  const comparison = usePullRequestComparison(
    guide && !stale ? locator : skipToken,
    guide?.headSha,
  );
  const [progress, { isLoading: changing }] = useSetGuidanceProgressMutation();
  const [message] = useAddGuidanceMessageMutation();
  const [clearMessages] = useClearGuidanceMessagesMutation();
  const [error, setError] = useState("");
  async function change(stepId: string, reviewed?: boolean) {
    setError("");
    try {
      await progress({ ...locator, stepId, reviewed }).unwrap();
    } catch (cause) {
      setError(errorMessageFrom(cause, "Progress could not be saved."));
    }
  }
  if (isLoading || loadingHead) return <ListLoadingState label="Loading walkthrough…" />;
  if (loadError || headError)
    return (
      <div role="alert" className="text-destructive p-6 text-sm">
        {errorMessageFrom(loadError ?? headError, "The walkthrough could not be loaded.")}
      </div>
    );
  if (!guide)
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-lg space-y-4 text-center">
          <BookOpen className="text-muted-foreground mx-auto size-8" />
          <h1 className="text-lg font-semibold">
            {activity?.status === "working"
              ? "Preparing your walkthrough"
              : "Let your agent walk you through this PR"}
          </h1>
          <GuidanceActivityStatus activity={activity} />
          {activity?.status !== "working" ? (
            <>
              <p className="text-muted-foreground text-sm leading-6">
                Connect your agent to Open Warden, then ask it to create a guided walkthrough.
                Steps, code references, and messages are saved here.
              </p>
              <p className="bg-surface-toolbar rounded-lg border p-3 text-sm">
                “Guide me through PR #{locator.pullRequestNumber} in Open Warden.”
              </p>
              <Button className="h-10" variant="outline" onClick={() => navigate("/settings")}>
                <Settings2 />
                Set up agent connection
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              The steps and code notes will appear here when the agent publishes them.
            </p>
          )}
        </div>
      </div>
    );
  return (
    <GuidanceView
      guide={guide}
      activity={activity}
      stale={stale}
      busy={changing}
      error={error}
      onSelectStep={(id) => {
        void change(id);
      }}
      onReviewed={(id, reviewed) => {
        if (!stale) void change(id, reviewed);
      }}
      onMessage={async (stepId, body) => {
        try {
          await message({ ...locator, stepId, body }).unwrap();
          return true;
        } catch {
          return false;
        }
      }}
      onClearMessages={async () => {
        try {
          await clearMessages(locator).unwrap();
          return true;
        } catch {
          return false;
        }
      }}
      renderDiff={(reference, step) => (
        <GuidanceDiff
          locator={locator}
          headSha={guide.headSha}
          comparison={comparison}
          reference={reference}
          step={step}
        />
      )}
    />
  );
}

function GuidanceDiff({
  locator,
  headSha,
  reference,
  step,
  comparison,
}: {
  locator: GuidanceLocator;
  headSha: string;
  reference: GuidanceReference;
  step: GuidanceStep;
  comparison: ReturnType<typeof usePullRequestComparison>;
}) {
  const { refs, files, loading, error: comparisonError } = comparison;
  const file = files?.find((item) => item.path === reference.path);
  const {
    currentData: versions,
    isFetching,
    error,
  } = useGetBranchFileVersionsQuery(
    refs && file
      ? {
          repoPath: locator.repoPath,
          baseRef: refs.compareBaseRef,
          headRef: refs.compareHeadRef,
          relPath: reference.path,
          previousPath: file.previousPath ?? undefined,
        }
      : skipToken,
  );
  const { conversation } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData }) => ({ conversation: currentData ?? null }),
  });
  const { anchorsByFile } = usePullRequestReviewAnchors({
    repoPath: locator.repoPath,
    compareBaseRef: refs?.compareBaseRef ?? "",
    compareHeadRef: refs?.compareHeadRef ?? "",
    files: files ?? [],
    reviewThreads: conversation?.reviewThreads ?? [],
  });
  const mentions = usePullRequestMentionCandidates(conversation);
  if (comparisonError || error)
    return (
      <p role="alert" className="text-destructive p-4 text-sm">
        {comparisonError || errorMessageFrom(error, "The referenced file could not be loaded.")}
      </p>
    );
  if (loading || (!versions && isFetching))
    return <ListLoadingState label="Loading referenced changes…" />;
  if (!file || !refs || !versions)
    return (
      <p role="alert" className="text-warning p-4 text-sm">
        This file is no longer available in the PR. Ask your agent to refresh the walkthrough.
      </p>
    );
  const references = step.references.filter((item) => item.path === reference.path);
  const invalidReference = references.some((item) => {
    const content = item.side === "base" ? versions.oldFile : versions.newFile;
    return !content || item.endLine > content.contents.split("\n").length;
  });
  if (invalidReference)
    return (
      <p role="alert" className="text-warning p-4 text-sm">
        This code reference does not match the file. Ask your agent to correct the line range.
      </p>
    );
  const explanations: DiffLineAnnotation<DiffAnnotationItem>[] = references.map((item) => ({
    side: item.side === "base" ? "deletions" : "additions",
    lineNumber: item.startLine - 1,
    metadata: {
      type: "guidance",
      id: `${step.id}:${item.path}:${item.side}:${item.startLine}:${item.endLine}`,
      title: step.title,
      body: item.note ?? step.body,
      details: item.note ? step.body : undefined,
      referenceLabel: `L${item.startLine}–${item.endLine}`,
    },
  }));
  const comments = buildPullRequestAnchorAnnotations({
    anchors: anchorsByFile[reference.path] ?? [],
    ...locator,
    compareBaseRef: refs.compareBaseRef,
    compareHeadRef: refs.compareHeadRef,
    providerId: refs.providerId,
  });

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <ReviewCommentsCopyToolbar
        {...locator}
        compareBaseRef={refs.compareBaseRef}
        compareHeadRef={refs.compareHeadRef}
        activePath={reference.path}
        activePreviousPath={file.previousPath ?? undefined}
      />
      <DiffWorkspace
        oldFile={versions.oldFile}
        newFile={versions.newFile}
        activePath={reference.path}
        commentContext={{
          kind: "review",
          baseRef: refs.compareBaseRef,
          headRef: refs.compareHeadRef,
        }}
        canComment
        includeCurrentFileComments={false}
        fileViewerRevision={refs.compareHeadRef}
        lspJumpContextKind="pull-request"
        defaultExpandUnchanged
        annotationItems={[...explanations, ...comments]}
        commentMentions={mentions}
        highlightedLines={{
          start: reference.startLine,
          end: reference.endLine,
          side: reference.side === "base" ? "deletions" : "additions",
        }}
        focusedLineNumber={reference.startLine}
        focusedLineKey={`${headSha}:${reference.path}:${reference.side}:${reference.startLine}:${reference.endLine}`}
      />
    </div>
  );
}
