import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { GitPullRequest, LoaderCircle, Plus } from "lucide-react";
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
import { pullRequestSummaryFromDetail } from "@/features/pull-requests/utils/pullRequestSummary";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import { selectActiveWorkspace } from "@/features/workspaces/workspacesSlice";
import type { PullRequestSummary } from "@/platform/desktop/contracts";

import { CommandComposerCards } from "./CommandComposerCards";
import type { ComposerCardStep } from "./CommandComposerCards";
import { CommandComposerLayout, useCommandComposerRootRef } from "./CommandComposerLayout";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import type { ComposerChoice } from "./CommandComposerChoiceStep";
import type { PullRequestComposerAction } from "./commandComposerModel";
import { actions, failureMessage } from "./commandComposerModel";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

export function PullRequestCommandComposer({
  action: initialAction,
  initialPullRequest,
  prefillFromWorkspace = true,
  onCreate,
  onBack,
  onClose,
}: {
  action: PullRequestComposerAction | null;
  initialPullRequest?: PullRequestSummary | null;
  prefillFromWorkspace?: boolean;
  onCreate: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const objectFirst = initialAction === null;
  const dispatch = useAppDispatch();
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const activeWorkspace = useAppSelector(selectActiveWorkspace);
  const activePullRequestWorkspace =
    activeWorkspace?.kind === "pull-request" ? activeWorkspace : null;
  const [pane, setPane] = useState<"choice" | "action" | "review" | "execute">(
    objectFirst
      ? initialPullRequest
        ? "action"
        : "choice"
      : initialPullRequest && initialAction !== "open-pr" && initialAction !== "copy-pr-link"
        ? "review"
        : "choice",
  );
  const [action, setAction] = useState<PullRequestComposerAction | null>(initialAction);
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
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const runRef = useRef<HTMLButtonElement>(null);
  const runningRef = useRef(false);
  const contextAppliedRef = useRef(false);
  const initialActionAppliedRef = useRef(false);
  const directAction = action === "open-pr" || action === "copy-pr-link";
  const { currentConversation } = useGetPullRequestConversationQuery(
    prefillFromWorkspace && !initialPullRequest && activePullRequestWorkspace
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
  const actionInfo = actions.find((item) => item.id === action);
  const actionLabel = actionInfo?.label ?? "Choose action";
  const pullRequestsOnPage = pullRequestPage?.pullRequests ?? [];
  const pullRequests =
    selectedPullRequest &&
    !pullRequestsOnPage.some((item) => item.number === selectedPullRequest.number)
      ? [selectedPullRequest, ...pullRequestsOnPage]
      : pullRequestsOnPage;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredPullRequests = pullRequests.filter((item) =>
    `${item.number} ${item.title} ${item.author.login} ${item.author.displayName ?? ""} ${item.headRef}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const pullRequestChoices: ComposerChoice[] = filteredPullRequests.map((item) => ({
    id: String(item.number),
    label: `#${item.number} ${item.title}`,
    detail: `${item.author.displayName ?? item.author.login} · ${item.headRef}${item.isDraft ? " · Draft" : ""}`,
    section:
      item === selectedPullRequest && !pullRequestsOnPage.includes(item)
        ? "Current pull request"
        : "Pull requests",
  }));
  if (objectFirst && (!normalizedQuery || "create pull request".includes(normalizedQuery))) {
    pullRequestChoices.unshift({
      id: "create-pr",
      label: "Create pull request",
      detail: "Create from the current branch",
      icon: Plus,
      section: "New",
    });
  }
  const actionIds: PullRequestComposerAction[] = [
    "open-pr",
    "open-pr-worktree",
    "copy-pr-link",
    "comment-pr",
    "submit-review",
    "merge-pr",
  ];
  const actionChoices: ComposerChoice[] = actionIds.flatMap((id) => {
    const item = actions.find((candidate) => candidate.id === id);
    if (!item) return [];

    const label =
      id === "open-pr"
        ? "Open review tab"
        : id === "open-pr-worktree"
          ? "Open in worktree"
          : item.label;
    if (normalizedQuery && !label.toLowerCase().includes(normalizedQuery)) return [];

    return [
      {
        id,
        label,
        detail:
          id === "open-pr"
            ? "Open this PR in an Open Warden tab"
            : id === "submit-review"
              ? "Comment, approve, or request changes"
              : id === "open-pr-worktree"
                ? "Open in a separate checkout"
                : id === "merge-pr"
                  ? "Choose a merge method"
                  : "For the selected pull request",
        disabled:
          (id === "submit-review" || id === "merge-pr") &&
          (selectedPullRequest?.state !== "open" || selectedPullRequest?.isDraft),
      },
    ];
  });
  const choices = pane === "action" && objectFirst ? actionChoices : pullRequestChoices;
  const activeChoice =
    choices.find((item) => item.id === highlightedId && !item.disabled) ??
    choices.find((item) => !item.disabled);
  const previewPullRequest =
    pane === "choice"
      ? pullRequests.find((item) => String(item.number) === activeChoice?.id)
      : selectedPullRequest;
  const previewAction =
    pane === "action" && objectFirst
      ? (actionIds.find((id) => id === activeChoice?.id) ?? null)
      : action;
  const canRun = Boolean(
    pane === "review" &&
    action &&
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
    if (pane === "choice" || pane === "action") searchRef.current?.focus();
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
  }, [action, hostedRepo?.providerId, pane, rootRef]);

  function selectChoice(id: string) {
    if (pane === "action" && objectFirst) {
      const nextAction = actionIds.find((candidate) => candidate === id);
      const choice = actionChoices.find((item) => item.id === id);
      if (!nextAction || choice?.disabled) return;
      setAction(nextAction);
      setQuery("");
      setHighlightedId(null);
      setError("");
      if (nextAction === "open-pr" || nextAction === "copy-pr-link") {
        void run(selectedPullRequest, nextAction);
      } else {
        setPane("review");
      }
      return;
    }
    if (id === "create-pr" && objectFirst) {
      onCreate();
      return;
    }
    const item = pullRequests.find((pullRequest) => String(pullRequest.number) === id);
    if (!item) return;
    contextAppliedRef.current = true;
    setSelectedPullRequest(item);
    setHighlightedId(null);
    setQuery("");
    setError("");
    if (objectFirst) setPane("action");
    else if (directAction) void run(item);
    else setPane("review");
  }

  function goBack() {
    if (busy) return;
    if (pane === "choice") onBack();
    else if (pane === "action" && objectFirst) {
      setPane("choice");
      setHighlightedId(selectedPullRequest ? String(selectedPullRequest.number) : null);
      setQuery("");
      setError("");
    } else {
      setPane(objectFirst ? "action" : "choice");
      setHighlightedId(
        objectFirst ? action : selectedPullRequest ? String(selectedPullRequest.number) : null,
      );
      setQuery("");
      setError("");
    }
  }

  async function run(target = selectedPullRequest, requestedAction = action) {
    if (
      !target ||
      !requestedAction ||
      runningRef.current ||
      (requestedAction !== "open-pr" && requestedAction !== "copy-pr-link" && !canRun)
    )
      return;
    runningRef.current = true;
    setBusy(true);
    setError("");
    setPane("execute");
    try {
      if (requestedAction === "open-pr" || requestedAction === "open-pr-worktree") {
        if (!hostedRepo) throw new Error("Connect a supported hosted repository first.");
        let reviewRepoPath = repoPath;
        if (requestedAction === "open-pr-worktree") {
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
      } else if (requestedAction === "copy-pr-link") {
        await navigator.clipboard.writeText(target.url);
      } else if (requestedAction === "comment-pr") {
        await addComment({
          repoPath,
          pullRequestNumber: target.number,
          body: message.trim(),
        }).unwrap();
      } else if (requestedAction === "approve-pr" || requestedAction === "request-changes") {
        await submitDecision({
          repoPath,
          pullRequestNumber: target.number,
          decision: requestedAction === "approve-pr" ? "approve" : "request-changes",
          body: message.trim(),
        }).unwrap();
        toast.success(
          requestedAction === "approve-pr" ? "Pull request approved" : "Changes requested",
        );
      } else if (requestedAction === "merge-pr") {
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
      setPane(
        requestedAction === "open-pr" || requestedAction === "copy-pr-link"
          ? objectFirst
            ? "action"
            : "choice"
          : "review",
      );
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
      !prefillFromWorkspace ||
      initialPullRequest ||
      !activePullRequestWorkspace ||
      !currentConversation
    )
      return;
    const detail = currentConversation.detail;
    const contextPullRequest = pullRequestSummaryFromDetail(detail, activePullRequestWorkspace);
    if (action === "open-pr" && !hostedRepo) return;
    contextAppliedRef.current = true;
    setSelectedPullRequest(contextPullRequest);
    if (objectFirst) setPane("action");
    else if (directAction) runFromContext(contextPullRequest);
    else setPane("review");
  }, [
    action,
    activePullRequestWorkspace,
    currentConversation,
    directAction,
    hostedRepo,
    initialPullRequest,
    objectFirst,
    prefillFromWorkspace,
  ]);

  useEffect(() => {
    if (objectFirst || !directAction || !initialPullRequest || initialActionAppliedRef.current)
      return;
    if (action === "open-pr" && !hostedRepo) return;
    initialActionAppliedRef.current = true;
    runFromContext(initialPullRequest);
  }, [action, directAction, hostedRepo, initialPullRequest, objectFirst]);

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    runButtonRef: runRef,
    pane,
    query,
    enabledChoiceIds: choices.filter((item) => !item.disabled).map((item) => item.id),
    activeChoiceId: activeChoice?.id,
    canRun,
    hasError: Boolean(error),
    busy,
    actionIsRoot: !objectFirst,
    onHighlight: setHighlightedId,
    onSelect: selectChoice,
    onBack: goBack,
    onClose,
    onRun: () => void run(),
  });

  let cardSteps: ComposerCardStep[] | undefined;

  if (objectFirst) {
    cardSteps = [
      {
        id: "scope",
        label: "Scope",
        value: "Pull requests",
        icon: GitPullRequest,
        active: false,
        onPress: () => {
          if (!busy) onBack();
        },
      },
      {
        id: "pull-request",
        label: "Pull request",
        value: previewPullRequest
          ? `#${previewPullRequest.number} ${previewPullRequest.title}`
          : "Choose a PR",
        previewKey: pane === "choice" ? activeChoice?.id : undefined,
        icon: GitPullRequest,
        active: pane === "choice",
        onPress: () => {
          if (busy) return;
          if (pane === "choice" && activeChoice) selectChoice(activeChoice.id);
          else {
            setPane("choice");
            setHighlightedId(selectedPullRequest ? String(selectedPullRequest.number) : null);
            setQuery("");
          }
        },
      },
    ];

    if (pane !== "choice") {
      const previewChoice = actionChoices.find((item) => item.id === previewAction);
      cardSteps.push({
        id: "action",
        label: "Action",
        value: pane === "action" ? (previewChoice?.label ?? "Choose action") : actionLabel,
        previewKey: pane === "action" ? activeChoice?.id : (action ?? undefined),
        icon: actions.find((item) => item.id === previewAction)?.icon ?? GitPullRequest,
        active: true,
        onPress: () => {
          if (busy) return;
          if (pane === "action" && activeChoice) selectChoice(activeChoice.id);
          else {
            setPane("action");
            setHighlightedId(action);
            setQuery("");
          }
        },
      });
    }
  }

  return (
    <CommandComposerLayout pane={pane}>
      <CommandComposerCards
        pane={pane}
        steps={cardSteps}
        actionLabel={
          pane === "action" && objectFirst
            ? (actionChoices.find((item) => item.id === previewAction)?.label ?? "Choose action")
            : actionLabel
        }
        previewAction={previewAction}
        operandLabel="Pull request"
        operandValue={
          previewPullRequest
            ? `#${previewPullRequest.number} ${previewPullRequest.title}`
            : "Choose a PR"
        }
        operandIcon={GitPullRequest}
        objectFirst={objectFirst}
        onActionPress={() => {
          if (pane === "action" && activeChoice) selectChoice(activeChoice.id);
          else goBack();
        }}
        onOperandPress={() => {
          if (pane === "choice" && activeChoice) selectChoice(activeChoice.id);
          else if (pane === "action" && objectFirst) goBack();
          else if (pane === "review") runRef.current?.focus();
        }}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">
            {pane === "choice"
              ? "Choose pull request"
              : pane === "action"
                ? "Choose an action"
                : pane === "review"
                  ? `Confirm ${actionLabel.toLowerCase()}`
                  : actionLabel}
          </p>
          <Button variant="ghost" size="sm" onClick={goBack} disabled={busy}>
            Back
          </Button>
        </div>
        {pane === "choice" || pane === "action" ? (
          <>
            <CommandComposerChoiceStep
              pane={pane}
              action={action}
              operandLabel={pane === "action" ? "Actions" : "Pull request"}
              choiceSearchLabel={pane === "action" ? "actions" : "pull requests"}
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
              searchPlaceholder={
                pane === "action" ? "Search PR actions…" : "Search pull requests on this page…"
              }
              choiceIcon={GitPullRequest}
            />
            {pane === "choice" && loadingPullRequests ? (
              <p role="status" className="text-muted-foreground text-xs">
                Loading pull requests…
              </p>
            ) : null}
            {pane === "choice" && listError ? (
              <p role="alert" className="text-destructive text-xs">
                {failureMessage(listError)}
              </p>
            ) : null}
            {pane === "choice" ? (
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
            ) : null}
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
                  {selectedPullRequest.author.displayName ?? selectedPullRequest.author.login} ·{" "}
                  {selectedPullRequest.headRef} → {selectedPullRequest.baseRef}
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
                      aria-pressed={reviewDecision === decision}
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
              Confirm {actionLabel.toLowerCase()}
            </Button>
          </div>
        ) : (
          <div className="change-composer-execution" role="status">
            <LoaderCircle className="size-5 animate-spin" /> {actionLabel}…
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
    </CommandComposerLayout>
  );
}
