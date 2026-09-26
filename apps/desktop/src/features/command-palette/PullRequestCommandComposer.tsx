import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useRef, useState } from "react";
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
  useSubmitPullRequestReviewCommentsMutation,
  useSubmitPullRequestDecisionMutation,
} from "@/features/hosted-repos/api";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
} from "@/features/pull-requests/utils/pendingReviewComments";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import { selectActiveWorkspace } from "@/features/workspaces/workspacesSlice";
import type { PullRequestOpenMode, PullRequestSummary } from "@/platform/desktop/contracts";

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
    initialPullRequest ? "review" : "choice",
  );
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedPullRequest, setSelectedPullRequest] = useState<PullRequestSummary | null>(
    initialPullRequest ?? null,
  );
  const [openMode, setOpenMode] = useState<PullRequestOpenMode>("worktree");
  const [mergeMethod, setMergeMethod] = useState<"merge" | "squash" | "rebase">("merge");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);
  const contextAppliedRef = useRef(false);
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
  const [submitReview] = useSubmitPullRequestReviewCommentsMutation();
  const [submitDecision] = useSubmitPullRequestDecisionMutation();
  const [mergePullRequest] = useMergePullRequestMutation();
  const { selectedConversation } = useGetPullRequestConversationQuery(
    selectedPullRequest &&
      (action === "merge-pr" || action === "approve-pr" || action === "request-changes")
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
    (action !== "open-pr" || hostedRepo) &&
    (action !== "comment-pr" || message.trim()) &&
    (action !== "submit-review" || pendingDrafts.length > 0) &&
    (action !== "request-changes" || hostedRepo?.providerId !== "github" || message.trim()) &&
    ((action !== "merge-pr" && action !== "approve-pr" && action !== "request-changes") ||
      (selectedConversation?.detail.state === "open" && !selectedConversation.detail.isDraft)) &&
    (action !== "merge-pr" || selectedConversation?.detail.headSha),
  );

  useEffect(() => {
    if (
      contextAppliedRef.current ||
      initialPullRequest ||
      !activePullRequestWorkspace ||
      !currentConversation
    )
      return;
    const detail = currentConversation.detail;
    contextAppliedRef.current = true;
    setSelectedPullRequest({
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
    });
    setPane("review");
  }, [activePullRequestWorkspace, currentConversation, initialPullRequest]);

  useEffect(() => {
    if (pane === "choice") searchRef.current?.focus();
    else if (
      pane === "review" &&
      (action === "comment-pr" ||
        (action === "request-changes" && hostedRepo?.providerId !== "bitbucket") ||
        action === "approve-pr")
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
    setPane("review");
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

  async function run() {
    if (!canRun || !selectedPullRequest || runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    setError("");
    setPane("execute");
    try {
      if (action === "open-pr") {
        if (!hostedRepo) throw new Error("Connect a supported hosted repository first.");
        const result = await dispatch(openPullRequestReview(selectedPullRequest.number, openMode));
        if (result.errorMessage || !result.repoPath)
          throw new Error(result.errorMessage ?? "The review workspace could not be opened.");
        await dispatch(
          openPullRequestWorkspace({
            repoPath: result.repoPath,
            providerId: selectedPullRequest.providerId,
            owner: hostedRepo.owner,
            repo: hostedRepo.repo,
            pullRequestNumber: selectedPullRequest.number,
            title: selectedPullRequest.title,
          }),
        );
      } else if (action === "copy-pr-link") {
        await navigator.clipboard.writeText(selectedPullRequest.url);
      } else if (action === "comment-pr") {
        await addComment({
          repoPath,
          pullRequestNumber: selectedPullRequest.number,
          body: message.trim(),
        }).unwrap();
      } else if (action === "approve-pr" || action === "request-changes") {
        await submitDecision({
          repoPath,
          pullRequestNumber: selectedPullRequest.number,
          decision: action === "approve-pr" ? "approve" : "request-changes",
          body: message.trim(),
        }).unwrap();
        toast.success(action === "approve-pr" ? "Pull request approved" : "Changes requested");
      } else if (action === "merge-pr") {
        const expectedHeadSha = selectedConversation?.detail.headSha;
        if (!expectedHeadSha) throw new Error("Load the latest pull request before merging.");
        const status = await mergePullRequest({
          repoPath,
          pullRequestNumber: selectedPullRequest.number,
          method: mergeMethod,
          expectedHeadSha,
        }).unwrap();
        toast.success(status === "queued" ? "Merge started" : "Pull request merged");
      } else {
        const result = await submitReview(
          buildSubmitPullRequestReviewCommentsInput({
            repoPath,
            pullRequestNumber: selectedPullRequest.number,
            comments: pendingDrafts,
          }),
        ).unwrap();
        if (result.submittedDraftIds.length)
          dispatch(removeCommentsByIds(result.submittedDraftIds));
        if (result.failedMessage) throw new Error(result.failedMessage);
      }
      onClose();
    } catch (cause) {
      setError(failureMessage(cause));
      setPane("review");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

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
            {action === "open-pr" ? (
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Open mode">
                <Button
                  variant={openMode === "worktree" ? "default" : "outline"}
                  onClick={() => setOpenMode("worktree")}
                >
                  New worktree
                </Button>
                <Button
                  variant={openMode === "branch" ? "default" : "outline"}
                  onClick={() => setOpenMode("branch")}
                >
                  Current checkout
                </Button>
                <p className="change-composer-help text-muted-foreground col-span-2 text-xs">
                  {openMode === "branch"
                    ? "Current checkout must have no local changes."
                    : "The review opens in a separate worktree."}
                </p>
              </div>
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
              <p className="change-composer-help text-muted-foreground text-xs tabular-nums">
                {loadingCompareRefs
                  ? "Loading review context…"
                  : `${pendingDrafts.length} pending inline ${pendingDrafts.length === 1 ? "comment" : "comments"} will be published.`}
              </p>
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
