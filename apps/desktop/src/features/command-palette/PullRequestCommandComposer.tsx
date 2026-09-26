import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { GitPullRequest, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { removeCommentsByIds } from "@/features/comments/commentsSlice";
import { openPullRequestReview } from "@/features/hosted-repos/actions";
import {
  useAddPullRequestCommentMutation,
  useGetPullRequestConversationQuery,
  useListPullRequestsQuery,
  useMergePullRequestMutation,
  usePreparePullRequestCompareRefsQuery,
  useResolveHostedRepoQuery,
  useSubmitPullRequestReviewMutation,
  useSubmitPullRequestDecisionMutation,
} from "@/features/hosted-repos/api";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
} from "@/features/pull-requests/utils/pendingReviewComments";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import { selectActiveWorkspace } from "@/features/workspaces/workspacesSlice";
import type { PullRequestSummary } from "@/platform/desktop/contracts";

import { CommandComposerCards } from "./CommandComposerCards";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import type { ComposerChoice } from "./CommandComposerChoiceStep";
import type { PullRequestComposerAction } from "./commandComposerModel";
import { actions, failureMessage } from "./commandComposerModel";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

export function PullRequestCommandComposer({
  action,
  initialPullRequest,
  onBack,
  onClose,
}: {
  action: PullRequestComposerAction;
  initialPullRequest?: PullRequestSummary | null;
  onBack: () => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const activeWorkspace = useAppSelector(selectActiveWorkspace);
  const activePullRequestWorkspace =
    activeWorkspace?.kind === "pull-request" ? activeWorkspace : null;
  const [pane, setPane] = useState<"choice" | "review" | "execute">(
    initialPullRequest && action !== "open-pr" && action !== "copy-pr-link" ? "review" : "choice",
  );
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedPullRequest, setSelectedPullRequest] = useState<PullRequestSummary | null>(
    initialPullRequest ?? null,
  );
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [reviewDecision, setReviewDecision] = useState<"comment" | "approve" | "request-changes">(
    "comment",
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);
  const contextAppliedRef = useRef(false);
  const initialActionAppliedRef = useRef(false);
  const directAction = action === "open-pr" || action === "copy-pr-link";
  const { currentConversation } = useGetPullRequestConversationQuery(
    !initialPullRequest && activePullRequestWorkspace
      ? { repoPath, pullRequestNumber: activePullRequestWorkspace.pullRequestNumber }
      : skipToken,
    { selectFromResult: ({ currentData }) => ({ currentConversation: currentData }) },
  );
  const { hostedRepo } = useResolveHostedRepoQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ hostedRepo: currentData }),
  });
  const { pullRequestPage, loadingPullRequests, listError } = useListPullRequestsQuery(
    { repoPath, page, perPage: 25 },
    {
      skip: !repoPath || pane !== "choice",
      selectFromResult: ({ currentData, isFetching, error }) => ({
        pullRequestPage: currentData,
        loadingPullRequests: isFetching,
        listError: error,
      }),
    },
  );
  const compareArgs =
    action === "submit-review" && selectedPullRequest
      ? { repoPath, pullRequestNumber: selectedPullRequest.number }
      : skipToken;
  const { compareRefs, loadingCompareRefs } = usePreparePullRequestCompareRefsQuery(compareArgs, {
    selectFromResult: ({ currentData, isFetching }) => ({
      compareRefs: currentData,
      loadingCompareRefs: isFetching,
    }),
  });
  const [addComment] = useAddPullRequestCommentMutation();
  const [submitReview] = useSubmitPullRequestReviewMutation();
  const [submitDecision] = useSubmitPullRequestDecisionMutation();
  const [mergePullRequest] = useMergePullRequestMutation();
  const { selectedConversation } = useGetPullRequestConversationQuery(
    selectedPullRequest &&
      (action === "merge-pr" ||
        action === "approve-pr" ||
        action === "request-changes" ||
        action === "submit-review")
      ? { repoPath, pullRequestNumber: selectedPullRequest.number }
      : skipToken,
    { selectFromResult: ({ currentData }) => ({ selectedConversation: currentData }) },
  );
  const pendingDrafts = compareRefs
    ? getPendingReviewCommentsForContext(comments, repoPath, {
        kind: "review",
        baseRef: compareRefs.compareBaseRef,
        headRef: compareRefs.compareHeadRef,
      })
    : [];
  const actionInfo = actions.find((item) => item.id === action)!;
  const pullRequests = pullRequestPage?.pullRequests ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPullRequests = pullRequests.filter((item) =>
    `${item.number} ${item.title} ${item.authorLogin} ${item.headRef}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const choices: ComposerChoice[] = filteredPullRequests.map((item) => ({
    id: String(item.number),
    label: `#${item.number} ${item.title}`,
    detail: `${item.authorLogin} · ${item.headRef}${item.isDraft ? " · Draft" : ""}`,
  }));
  const activeChoice = choices.find((item) => item.id === highlightedId) ?? choices[0];
  const previewPullRequest =
    pane === "choice"
      ? pullRequests.find((item) => String(item.number) === activeChoice?.id)
      : selectedPullRequest;
  const canRun = Boolean(
    pane === "review" &&
    selectedPullRequest &&
    !busy &&
    (action !== "open-pr-worktree" || hostedRepo) &&
    (action !== "comment-pr" || message.trim()) &&
    (action !== "submit-review" ||
      (Boolean(selectedConversation?.detail.headSha) &&
        (reviewDecision !== "comment" || Boolean(message.trim() || pendingDrafts.length)) &&
        (reviewDecision !== "request-changes" || Boolean(message.trim())) &&
        selectedConversation?.detail.state === "open" &&
        !selectedConversation.detail.isDraft)) &&
    (action !== "request-changes" || hostedRepo?.providerId !== "github" || message.trim()) &&
    ((action !== "merge-pr" && action !== "approve-pr" && action !== "request-changes") ||
      (selectedConversation?.detail.state === "open" && !selectedConversation.detail.isDraft)) &&
    (action !== "merge-pr" || selectedConversation?.detail.headSha),
  );

  useEffect(() => {
    if (pane === "choice") searchRef.current?.focus();
    else if (
      pane === "review" &&
      (action === "comment-pr" ||
        (action === "request-changes" && hostedRepo?.providerId !== "bitbucket") ||
        action === "approve-pr" ||
        action === "submit-review")
    )
      messageRef.current?.focus();
    else if (pane === "review") runRef.current?.focus();
    else rootRef.current?.focus({ preventScroll: true });
  }, [action, hostedRepo?.providerId, pane]);

  function selectChoice(id: string) {
    const item = pullRequests.find((pullRequest) => String(pullRequest.number) === id);
    if (!item) return;
    setSelectedPullRequest(item);
    setHighlightedId(null);
    setError("");
    if (directAction) void run(item);
    else setPane("review");
  }

  function goBack() {
    if (busy) return;
    if (pane === "choice") onBack();
    else {
      setPane("choice");
      setHighlightedId(selectedPullRequest ? String(selectedPullRequest.number) : null);
      setError("");
    }
  }

  async function run(target = selectedPullRequest) {
    if (!target || runningRef.current || (!directAction && !canRun)) return;
    runningRef.current = true;
    setBusy(true);
    setError("");
    setPane("execute");
    try {
      if (action === "open-pr" || action === "open-pr-worktree") {
        if (!hostedRepo) throw new Error("Connect a supported hosted repository first.");
        let reviewRepoPath = repoPath;
        if (action === "open-pr-worktree") {
          const result = await dispatch(openPullRequestReview(target.number, "worktree"));
          if (result.errorMessage || !result.repoPath)
            throw new Error(result.errorMessage ?? "The review worktree could not be opened.");
          reviewRepoPath = result.repoPath;
        }
        await dispatch(
          openPullRequestWorkspace({
            repoPath: reviewRepoPath,
            providerId: target.providerId,
            owner: hostedRepo.owner,
            repo: hostedRepo.repo,
            pullRequestNumber: target.number,
            title: target.title,
          }),
        );
      } else if (action === "copy-pr-link") {
        await navigator.clipboard.writeText(target.url);
      } else if (action === "comment-pr") {
        await addComment({
          repoPath,
          pullRequestNumber: target.number,
          body: message.trim(),
        }).unwrap();
      } else if (action === "approve-pr" || action === "request-changes") {
        await submitDecision({
          repoPath,
          pullRequestNumber: target.number,
          decision: action === "approve-pr" ? "approve" : "request-changes",
          body: message.trim(),
        }).unwrap();
        toast.success(action === "approve-pr" ? "Pull request approved" : "Changes requested");
      } else if (action === "merge-pr") {
        const expectedHeadSha = selectedConversation?.detail.headSha;
        if (!expectedHeadSha) throw new Error("Load the latest pull request before merging.");
        const status = await mergePullRequest({
          repoPath,
          pullRequestNumber: target.number,
          method: mergeMethod,
          expectedHeadSha,
        }).unwrap();
        toast.success(status === "queued" ? "Merge started" : "Pull request merged");
      } else {
        const expectedHeadSha = selectedConversation?.detail.headSha;
        if (!expectedHeadSha)
          throw new Error("Load the latest pull request before submitting a review.");
        const result = await submitReview({
          ...buildSubmitPullRequestReviewCommentsInput({
            repoPath,
            pullRequestNumber: target.number,
            comments: pendingDrafts,
          }),
          expectedHeadSha,
          decision: reviewDecision,
          body: message.trim(),
        }).unwrap();
        if (result.submittedDraftIds.length)
          dispatch(removeCommentsByIds(result.submittedDraftIds));
        if (result.failedMessage) throw new Error(result.failedMessage);
      }
      onClose();
    } catch (cause) {
      setError(failureMessage(cause));
      setPane(directAction ? "choice" : "review");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  const runFromContext = useEffectEvent((target: PullRequestSummary) => {
    void run(target);
  });

  useEffect(() => {
    if (
      contextAppliedRef.current ||
      initialPullRequest ||
      !activePullRequestWorkspace ||
      !currentConversation
    )
      return;
    const detail = currentConversation.detail;
    const contextPullRequest: PullRequestSummary = {
      id: detail.id,
      providerId: detail.providerId,
      number: detail.number,
      title: detail.title,
      state: detail.state,
      isDraft: detail.isDraft,
      authorLogin: detail.author?.login ?? "",
      authorDisplayName: detail.author?.displayName ?? null,
      url: detail.url,
      baseRef: detail.baseRef,
      headRef: detail.headRef,
      headOwner: activePullRequestWorkspace.owner,
      headRepo: activePullRequestWorkspace.repo,
      updatedAt: detail.updatedAt,
    };
    if (action === "open-pr" && !hostedRepo) return;
    contextAppliedRef.current = true;
    setSelectedPullRequest(contextPullRequest);
    if (directAction) runFromContext(contextPullRequest);
    else setPane("review");
  }, [
    action,
    activePullRequestWorkspace,
    currentConversation,
    directAction,
    hostedRepo,
    initialPullRequest,
  ]);

  useEffect(() => {
    if (!directAction || !initialPullRequest || initialActionAppliedRef.current) return;
    if (action === "open-pr" && !hostedRepo) return;
    initialActionAppliedRef.current = true;
    runFromContext(initialPullRequest);
  }, [action, directAction, hostedRepo, initialPullRequest]);

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    pane,
    query,
    enabledChoiceIds: choices.map((item) => item.id),
    activeChoiceId: activeChoice?.id,
    canRun,
    hasError: Boolean(error),
    busy,
    onHighlight: setHighlightedId,
    onSelect: selectChoice,
    onBack: goBack,
    onClose,
    onRun: () => void run(),
  });

  return (
    <div ref={rootRef} tabIndex={-1} className="change-composer" data-pane={pane}>
      <CommandComposerCards
        pane={pane}
        actionLabel={actionInfo.label}
        previewAction={action}
        operandLabel="Pull request"
        operandValue={
          previewPullRequest
            ? `#${previewPullRequest.number} ${previewPullRequest.title}`
            : "Choose a PR"
        }
        operandIcon={GitPullRequest}
        onActionPress={goBack}
        onOperandPress={() => {
          if (pane === "choice" && activeChoice) selectChoice(activeChoice.id);
          else if (pane === "review") runRef.current?.focus();
        }}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">
            {pane === "choice"
              ? "Choose pull request"
              : pane === "review"
                ? `Confirm ${actionInfo.label.toLowerCase()}`
                : actionInfo.label}
          </p>
          <Button variant="ghost" size="sm" onClick={goBack} disabled={busy}>
            Back
          </Button>
        </div>
        {pane === "choice" ? (
          <>
            <CommandComposerChoiceStep
              pane="choice"
              action={action}
              operandLabel="Pull request"
              choiceSearchLabel="pull requests"
              query={query}
              choices={choices}
              matchingCount={choices.length}
              activeChoiceId={activeChoice?.id}
              busy={busy}
              searchRef={searchRef}
              onQueryChange={(value) => {
                setQuery(value);
                setHighlightedId(null);
              }}
              onHighlight={setHighlightedId}
              onSelect={selectChoice}
              searchPlaceholder="Search pull requests on this page…"
              choiceIcon={GitPullRequest}
            />
            {loadingPullRequests ? (
              <p role="status" className="text-muted-foreground text-xs">
                Loading pull requests…
              </p>
            ) : null}
            {listError ? (
              <p role="alert" className="text-destructive text-xs">
                {failureMessage(listError)}
              </p>
            ) : null}
            <div className="flex items-center justify-between gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(page - 1);
                  setHighlightedId(null);
                }}
                disabled={page === 1 || loadingPullRequests}
              >
                Previous
              </Button>
              <span className="text-muted-foreground tabular-nums">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPage(page + 1);
                  setHighlightedId(null);
                }}
                disabled={!pullRequestPage?.hasNextPage || loadingPullRequests}
              >
                Next
              </Button>
            </div>
          </>
        ) : pane === "review" && selectedPullRequest ? (
          <div className="change-composer-review-content">
            <div className="change-composer-review" role="group" aria-label="Pull request preview">
              <span className="change-composer-review-icon">
                <GitPullRequest className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  #{selectedPullRequest.number} {selectedPullRequest.title}
                </p>
                <p className="change-composer-help text-muted-foreground text-xs">
                  {selectedPullRequest.authorLogin} · {selectedPullRequest.headRef} →{" "}
                  {selectedPullRequest.baseRef}
                </p>
              </div>
            </div>
            {action === "open-pr-worktree" ? (
              <p className="change-composer-help text-muted-foreground text-xs">
                Check out this pull request in a separate worktree and open its review tab.
              </p>
            ) : action === "request-changes" && hostedRepo?.providerId === "bitbucket" ? (
              <p className="change-composer-help text-muted-foreground text-xs">
                Bitbucket records the change request without a review note.
              </p>
            ) : action === "comment-pr" ||
              action === "approve-pr" ||
              action === "request-changes" ? (
              <>
                <label className="change-composer-panel-label" htmlFor="composer-pr-comment">
                  {action === "request-changes"
                    ? "Changes requested"
                    : action === "approve-pr"
                      ? "Review note (optional)"
                      : "Comment"}
                </label>
                <Textarea
                  id="composer-pr-comment"
                  ref={messageRef}
                  className="min-h-24 min-w-0 text-sm"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder={
                    action === "request-changes"
                      ? "Explain what needs to change…"
                      : "Write a comment…"
                  }
                />
              </>
            ) : action === "merge-pr" ? (
              <>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Merge method">
                  {(["merge", "squash", "rebase"] as const).map((method) => (
                    <Button
                      key={method}
                      variant={mergeMethod === method ? "default" : "outline"}
                      onClick={() => setMergeMethod(method)}
                      className="min-w-0 capitalize"
                    >
                      {method}
                    </Button>
                  ))}
                </div>
                <p className="change-composer-help text-muted-foreground text-xs">
                  {selectedConversation
                    ? `Head ${selectedConversation.detail.headSha.slice(0, 8)} · ${selectedConversation.detail.state}${selectedConversation.detail.isDraft ? " · Draft" : ""}`
                    : "Loading merge state…"}
                </p>
              </>
            ) : action === "submit-review" ? (
              <>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Review decision">
                  {(["comment", "approve", "request-changes"] as const).map((decision) => (
                    <Button
                      key={decision}
                      variant={reviewDecision === decision ? "default" : "outline"}
                      onClick={() => setReviewDecision(decision)}
                      className="min-w-0 text-xs"
                    >
                      {decision === "comment"
                        ? "Comment"
                        : decision === "approve"
                          ? "Approve"
                          : "Request changes"}
                    </Button>
                  ))}
                </div>
                <label className="change-composer-panel-label" htmlFor="composer-review-message">
                  Review message
                  {reviewDecision === "request-changes" ? " (required)" : " (optional)"}
                </label>
                <Textarea
                  id="composer-review-message"
                  ref={messageRef}
                  className="min-h-24 min-w-0 text-sm"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write your review…"
                />
                <p className="change-composer-help text-muted-foreground text-xs tabular-nums">
                  {loadingCompareRefs
                    ? "Loading review context…"
                    : `${pendingDrafts.length} pending inline ${pendingDrafts.length === 1 ? "comment" : "comments"} will be published.`}
                  {hostedRepo?.providerId === "bitbucket"
                    ? " Bitbucket posts comments and the decision separately."
                    : ""}
                </p>
              </>
            ) : (
              <p className="change-composer-help text-muted-foreground text-xs">
                {selectedPullRequest.url}
              </p>
            )}
            <Button ref={runRef} onClick={() => void run()} disabled={!canRun}>
              Confirm {actionInfo.label.toLowerCase()}
            </Button>
          </div>
        ) : (
          <div className="change-composer-execution" role="status">
            <LoaderCircle className="size-5 animate-spin" /> {actionInfo.label}…
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="change-composer-footer">
          <span>
            <Kbd>↑↓</Kbd> Choose
          </span>
          <span>
            <Kbd>↵</Kbd> {pane === "review" ? "Confirm" : "Select"}
          </span>
          <span>
            <Kbd>Esc</Kbd> Back
          </span>
        </div>
      </div>
    </div>
  );
}
