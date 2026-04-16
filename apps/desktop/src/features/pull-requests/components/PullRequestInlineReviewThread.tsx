import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  CornerDownLeft,
  ExternalLink,
  MessagesSquare,
  Quote,
} from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  MarkdownEditor,
  type MentionConfig,
} from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import {
  useReplyToPullRequestThreadMutation,
  useSetPullRequestThreadResolvedMutation,
} from "@/features/hosted-repos/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import {
  appendQuotedBody,
  authorLabel,
  Avatar,
  CommentBody,
  copyToClipboard,
  toDisplayDate,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { setActiveConversationThreadId } from "@/features/pull-requests/pullRequestsSlice";
import type { GitProviderId, PullRequestReviewThread } from "@/platform/desktop";

type PullRequestInlineReviewThreadProps = {
  providerId?: GitProviderId;
  repoPath: string;
  pullRequestNumber: number;
  thread: PullRequestReviewThread;
  onOpenFile?: () => void;
  mentions?: MentionConfig;
};

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

function threadLineLabel(thread: PullRequestReviewThread) {
  const startLine = thread.startLine ?? thread.line;
  const endLine = thread.line ?? thread.startLine;

  if (startLine && endLine && startLine !== endLine) {
    return `L${startLine}-${endLine}`;
  }

  if (endLine) {
    return `Line ${endLine}`;
  }

  return "Unknown line";
}

export function PullRequestInlineReviewThread({
  providerId,
  repoPath,
  pullRequestNumber,
  thread,
  onOpenFile,
  mentions,
}: PullRequestInlineReviewThreadProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const activeThreadId = useAppSelector((state) => state.pullRequests.activeConversationThreadId);
  const currentReviewProviderId = useAppSelector(
    (state) => state.pullRequests.currentReview?.providerId ?? null,
  );
  const [replyDraft, setReplyDraft] = useState("");
  const [replyOpen, setReplyOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(thread.isResolved);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [replyToPullRequestThread, { isLoading: replyingToThread }] =
    useReplyToPullRequestThreadMutation();
  const [setPullRequestThreadResolved, { isLoading: updatingThreadResolution }] =
    useSetPullRequestThreadResolvedMutation();

  const rootComment = thread.comments[0] ?? null;
  const replies = thread.comments.slice(1);
  const selected = activeThreadId === thread.id;
  const resolutionPending = updatingThreadResolution && pendingThreadId === thread.id;
  const replyPending = replyingToThread && pendingThreadId === thread.id;
  const subtleActionClass =
    "border-border/60 bg-black/10 hover:bg-black/20 h-7 gap-1.5 rounded-full border px-3 text-[11px] font-medium text-foreground/90";
  const lineLabel = threadLineLabel(thread);
  const activeProviderId = providerId ?? currentReviewProviderId ?? "github";
  const providerName = providerTitle(activeProviderId);
  const canResolveThreads = activeProviderId === "github" || activeProviderId === "bitbucket";

  useEffect(() => {
    if (thread.isResolved) {
      setCollapsed(true);
    }
  }, [thread.isResolved]);

  async function submitReply() {
    const body = replyDraft.trim();
    if (!body) return;

    try {
      setPendingThreadId(thread.id);
      await replyToPullRequestThread({
        repoPath,
        pullRequestNumber,
        threadId: thread.id,
        body,
      }).unwrap();
      setReplyDraft("");
      setReplyOpen(false);
      toast.success(`Reply posted to ${providerName}`);
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to post reply"));
    } finally {
      setPendingThreadId(null);
    }
  }

  async function toggleResolution() {
    try {
      setPendingThreadId(thread.id);
      await setPullRequestThreadResolved({
        repoPath,
        pullRequestNumber,
        threadId: thread.id,
        resolved: !thread.isResolved,
      }).unwrap();
      setCollapsed(!thread.isResolved);
      toast.success(thread.isResolved ? "Thread reopened" : "Thread resolved");
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to update thread"));
    } finally {
      setPendingThreadId(null);
    }
  }

  const openConversation = () => {
    dispatch(setActiveConversationThreadId(thread.id));
    navigate("../conversation", { relative: "path" });
  };

  return (
    <section
      className={`border-border/60 bg-surface-elevated border ${selected ? "border-primary/40" : ""}`}
    >
      <div className="border-border/60 flex items-start justify-between gap-3 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground inline-flex h-5 w-5 items-center justify-center"
              onClick={() => {
                setCollapsed((current) => !current);
              }}
              aria-label={collapsed ? "Expand thread" : "Collapse thread"}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="text-[12px] font-semibold tracking-[-0.01em] hover:underline"
              onClick={openConversation}
            >
              Comment on {lineLabel}
            </button>
            <div className="text-muted-foreground text-[11px]">
              {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
            </div>
            <div
              className={`border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] ${
                thread.isResolved
                  ? "border-emerald-500/30 bg-emerald-500/8 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/8 text-amber-300"
              }`}
            >
              {thread.isResolved ? "Resolved" : "Unresolved"}
            </div>
            {thread.isOutdated ? (
              <div className="border-border/70 bg-background text-muted-foreground border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em]">
                Outdated
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          {onOpenFile ? (
            <Button variant="ghost" size="sm" className={subtleActionClass} onClick={onOpenFile}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open file
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className={subtleActionClass} onClick={openConversation}>
              <MessagesSquare className="h-3.5 w-3.5" />
              Conversation
            </Button>
          )}
          {canResolveThreads ? (
            <Button
              variant="ghost"
              size="sm"
              className={subtleActionClass}
              disabled={resolutionPending}
              onClick={toggleResolution}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {thread.isResolved ? "Reopen" : "Resolve"}
            </Button>
          ) : null}
        </div>
      </div>

      {collapsed ? null : (
        <div className="bg-background/30">
          {rootComment ? (
            <div className="border-border/50 border-b px-4 py-4">
              <div className="flex items-start gap-3">
                <Avatar
                  login={rootComment.author?.login ?? null}
                  avatarUrl={rootComment.author?.avatarUrl ?? null}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="text-[13px] font-semibold tracking-[-0.01em]">
                      {authorLabel(
                        rootComment.author?.login ?? null,
                        rootComment.author?.displayName ?? null,
                      )}
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      {toDisplayDate(rootComment.createdAt)}
                    </div>
                  </div>
                  <div className="mt-2">
                    <CommentBody body={rootComment.body} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={subtleActionClass}
                      onClick={() => {
                        setReplyOpen(true);
                        setReplyDraft((current) => appendQuotedBody(current, rootComment.body));
                      }}
                    >
                      <CornerDownLeft className="h-3.5 w-3.5" />
                      Reply
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={subtleActionClass}
                      onClick={() =>
                        void copyToClipboard(rootComment.body, "Review comment copied")
                      }
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {replies.length > 0 ? (
            <div className="px-4 py-3">
              <div className="border-border/50 space-y-3 border-l pl-4">
                {replies.map((reply) => (
                  <div key={reply.id} className="flex items-start gap-3">
                    <Avatar
                      login={reply.author?.login ?? null}
                      avatarUrl={reply.author?.avatarUrl ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="text-[13px] font-semibold tracking-[-0.01em]">
                          {authorLabel(
                            reply.author?.login ?? null,
                            reply.author?.displayName ?? null,
                          )}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {toDisplayDate(reply.createdAt)}
                        </div>
                      </div>
                      <div className="mt-1.5">
                        <CommentBody body={reply.body} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={subtleActionClass}
                          onClick={() => {
                            setReplyOpen(true);
                            setReplyDraft((current) => appendQuotedBody(current, reply.body));
                          }}
                        >
                          <Quote className="h-3.5 w-3.5" />
                          Quote
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={subtleActionClass}
                          onClick={() => void copyToClipboard(reply.body, "Review reply copied")}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {replyOpen ? (
            <div className="border-border/60 border-t px-4 py-4">
              <div className="space-y-3">
                <MarkdownEditor
                  value={replyDraft}
                  onChange={setReplyDraft}
                  placeholder="Reply to this review thread..."
                  compact
                  mentions={mentions}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className="h-7 rounded-none px-2 text-[12px]"
                    onClick={() => {
                      setReplyOpen(false);
                      setReplyDraft("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={replyPending}
                    className="h-7 rounded-full px-3 text-[12px]"
                    onClick={() => {
                      void submitReply();
                    }}
                  >
                    <MessagesSquare className="h-3.5 w-3.5" />
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
