import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Check, MessageSquare, ShieldAlert, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ActionError } from "@/components/ui/error-state";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { removeComment, removeCommentsByIds } from "@/features/comments/commentsSlice";
import {
  useGetPullRequestConversationQuery,
  usePreparePullRequestCompareRefsQuery,
  useSubmitPullRequestReviewMutation,
} from "@/features/hosted-repos/api";
import type { CommentItem } from "@/features/source-control/types";
import type { PullRequestSummary } from "@/platform/desktop/contracts";
import type { ReviewDraft } from "@/platform/desktop/reviewDrafts";
import {
  usePullRequestRefresh,
  useRetainPullRequestRefresh,
} from "../refresh/PullRequestRefreshProvider";
import { reviewDraftRemoved, reviewDraftSaved } from "../reviewDraftsSlice";
import {
  buildSubmitPullRequestReviewCommentsInput,
  getPendingReviewCommentsForContext,
} from "../utils/pendingReviewComments";

const resources = ["comparison"] as const;
const decisions = [
  { value: "comment", label: "Comment", icon: MessageSquare },
  { value: "approve", label: "Approve", icon: Check },
  { value: "request-changes", label: "Request changes", icon: ShieldAlert },
] as const;

type PanelProps = {
  title: string;
  number: number;
  decision: ReviewDraft["decision"];
  message: string;
  pendingComments: readonly CommentItem[];
  busy: boolean;
  canSubmit: boolean;
  notice?: string;
  error?: unknown;
  onDecision: (decision: ReviewDraft["decision"]) => void;
  onMessage: (message: string) => void;
  onSubmit: () => void;
  onRemoveComment: (id: string) => void;
  onClose: () => void;
  onRefresh?: () => void;
};

export function PullRequestReviewPanelView(props: PanelProps) {
  const root = useRef<HTMLDivElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messageInput.current?.focus();
  }, []);

  useHotkey("Escape", props.onClose, {
    target: root,
    ignoreInputs: false,
    enabled: !props.busy,
  });
  useHotkey("Mod+Enter", props.onSubmit, {
    target: root,
    ignoreInputs: false,
    enabled: props.canSubmit,
  });

  return (
    <div
      ref={root}
      className="bg-background flex max-h-[min(640px,calc(100vh-4rem))] flex-col overflow-hidden rounded-lg border shadow-lg"
      aria-busy={props.busy}
    >
      <header className="flex items-start justify-between gap-4 border-b px-4 py-3">
        <div className="min-w-0 space-y-1">
          <h2 className="text-sm font-semibold">Review pull request</h2>
          <p className="text-muted-foreground text-xs break-words">
            #{props.number} · {props.title}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close review"
          disabled={props.busy}
          onClick={props.onClose}
        >
          <X />
        </Button>
      </header>
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
        <fieldset disabled={props.busy} className="space-y-2">
          <legend className="mb-2 text-xs font-medium">Decision</legend>
          <div className="grid grid-cols-3 gap-2">
            {decisions.map(({ value, label, icon: Icon }) => (
              <label
                key={value}
                className="relative has-[:checked]:border-ring has-[:checked]:bg-accent hover:bg-accent/50 flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-md border px-2 text-xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              >
                <input
                  className="absolute inset-0 size-full cursor-pointer opacity-0"
                  type="radio"
                  name="review-decision"
                  value={value}
                  checked={props.decision === value}
                  onChange={() => props.onDecision(value)}
                />
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="space-y-2">
          <label htmlFor="review-message" className="text-xs font-medium">
            Review message{" "}
            <span className="text-muted-foreground">
              {props.decision === "request-changes" ? "(required)" : "(optional)"}
            </span>
          </label>
          <Textarea
            id="review-message"
            ref={messageInput}
            value={props.message}
            disabled={props.busy}
            onChange={(event) => props.onMessage(event.target.value)}
            placeholder="Write your review…"
            className="min-h-28 resize-y text-sm"
          />
        </div>
        {props.pendingComments.length > 0 ? (
          <section aria-label="Pending inline comments" className="space-y-2">
            <h3 className="text-xs font-medium tabular-nums">
              {props.pendingComments.length} pending inline{" "}
              {props.pendingComments.length === 1 ? "comment" : "comments"}
            </h3>
            <ul className="divide-y rounded-md border">
              {props.pendingComments.map((comment) => (
                <li key={comment.id} className="space-y-1 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-muted-foreground font-mono text-[11px] break-all">
                      {comment.filePath}:{comment.startLine}
                      {comment.endLine !== comment.startLine ? `–${comment.endLine}` : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete pending comment on ${comment.filePath}:${comment.startLine}`}
                      title="Delete pending comment"
                      disabled={props.busy}
                      onClick={() => {
                        props.onRemoveComment(comment.id);
                        messageInput.current?.focus();
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs whitespace-pre-wrap break-words">{comment.text}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {props.notice ? (
          <div
            role="status"
            className="text-muted-foreground flex items-center justify-between gap-3 text-xs"
          >
            <p>{props.notice}</p>
            {props.onRefresh ? (
              <Button size="xs" variant="outline" onClick={props.onRefresh}>
                Refresh
              </Button>
            ) : null}
          </div>
        ) : null}
        {props.error ? (
          <ActionError
            title="Review not submitted"
            error={props.error}
            recovery={
              props.canSubmit ? { label: "Retry review", onAction: props.onSubmit } : undefined
            }
          />
        ) : null}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-muted-foreground text-xs" role="status">
          {props.busy ? "Submitting review…" : "Draft saved on this device · Esc to close"}
        </p>
        <Button size="sm" disabled={!props.canSubmit} onClick={props.onSubmit}>
          {props.busy ? "Submitting…" : "Submit review"}
          <Kbd>⌘↵</Kbd>
        </Button>
      </footer>
    </div>
  );
}

export function PullRequestReviewPanel({
  repoPath,
  pullRequest,
  onClose,
  onBusyChange,
}: {
  repoPath: string;
  pullRequest: PullRequestSummary;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const locator = { repoPath, pullRequestNumber: pullRequest.number };
  const draft = useAppSelector((state) =>
    state.reviewDrafts.find(
      (item) => item.repoPath === repoPath && item.pullRequestNumber === pullRequest.number,
    ),
  );
  const comments = useAppSelector((state) => state.comments);
  const decision = draft?.decision ?? "comment";
  const message = draft?.message ?? "";
  const refresh = usePullRequestRefresh(locator);
  useRetainPullRequestRefresh(locator, resources);

  const { conversation, conversationError } = useGetPullRequestConversationQuery(locator, {
    selectFromResult: ({ currentData, error }) => ({
      conversation: currentData,
      conversationError: error,
    }),
  });
  const { compareRefs, loading, compareError } = usePreparePullRequestCompareRefsQuery(
    repoPath ? locator : skipToken,
    {
      selectFromResult: ({ currentData, isFetching, error }) => ({
        compareRefs: currentData,
        loading: isFetching,
        compareError: error,
      }),
    },
  );
  const pendingComments = compareRefs
    ? getPendingReviewCommentsForContext(comments, repoPath, {
        kind: "review",
        baseRef: compareRefs.compareBaseRef,
        headRef: compareRefs.compareHeadRef,
      })
    : [];
  const [submit, { isLoading }] = useSubmitPullRequestReviewMutation();
  const running = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const detail = conversation?.detail;
  const revisionMatches = Boolean(
    compareRefs &&
    detail &&
    compareRefs.compareHeadRef.startsWith(detail.headSha) &&
    compareRefs.baseSha.startsWith(detail.baseSha),
  );
  const ready = Boolean(
    detail?.state === "open" &&
    !detail.isDraft &&
    revisionMatches &&
    !refresh.revisionPending &&
    !loading,
  );
  const canSubmit =
    ready &&
    !isLoading &&
    (decision !== "request-changes" || Boolean(message.trim())) &&
    (decision !== "comment" || Boolean(message.trim() || pendingComments.length));

  useEffect(() => {
    onBusyChange?.(isLoading);
    return () => onBusyChange?.(false);
  }, [isLoading, onBusyChange]);

  function save(values: Partial<Pick<ReviewDraft, "decision" | "message" | "publishedMessage">>) {
    dispatch(
      reviewDraftSaved({
        ...locator,
        decision,
        message,
        publishedMessage: draft?.publishedMessage,
        ...values,
      }),
    );
  }

  async function submitReview() {
    if (!canSubmit || !detail || running.current) return;

    running.current = true;
    setError(null);
    const result = await submit({
      ...buildSubmitPullRequestReviewCommentsInput({ ...locator, comments: pendingComments }),
      decision,
      body: message.trim(),
      expectedHeadSha: detail.headSha,
      messageAlreadyPublished: draft?.publishedMessage === message.trim(),
    });
    running.current = false;

    if ("error" in result) {
      setError(result.error);
      return;
    }

    dispatch(removeCommentsByIds(result.data.submittedDraftIds));

    if (result.data.failedMessage) {
      if (result.data.messageSubmitted) save({ publishedMessage: message.trim() });
      setError({
        operation: "submitPullRequestReview",
        code: "unavailable",
        message: result.data.failedMessage,
      });
      return;
    }

    dispatch(reviewDraftRemoved(locator));
    toast.success("Review submitted");
    onClose();
  }

  let notice: string | undefined;
  if (loading && !compareRefs) notice = "Loading the current review revision…";
  else if (detail && (detail.state !== "open" || detail.isDraft))
    notice = "This pull request is not ready for review.";
  else if (!ready) notice = "Refresh the pull request before submitting this review.";

  return (
    <PullRequestReviewPanelView
      title={pullRequest.title}
      number={pullRequest.number}
      decision={decision}
      message={message}
      pendingComments={pendingComments}
      busy={isLoading}
      canSubmit={canSubmit}
      notice={notice}
      error={error ?? conversationError ?? compareError}
      onDecision={(value) => save({ decision: value })}
      onMessage={(value) => save({ message: value })}
      onSubmit={() => void submitReview()}
      onRemoveComment={(id) => {
        if (!running.current && pendingComments.some((comment) => comment.id === id)) {
          dispatch(removeComment(id));
        }
      }}
      onClose={() => {
        if (!running.current) onClose();
      }}
      onRefresh={!ready && !refresh.busy ? () => void refresh.refresh() : undefined}
    />
  );
}
