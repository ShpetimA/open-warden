import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  MessagesSquare,
  Quote,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { MarkdownEditor, type MentionConfig } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import {
  useReplyToPullRequestThreadMutation,
  useSetPullRequestThreadResolvedMutation,
} from "@/features/hosted-repos/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import {
  appendQuotedBody,
  authorLabel,
  CommentBody,
  copyToClipboard,
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

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

  const selected = activeThreadId === thread.id;
  const resolutionPending = updatingThreadResolution && pendingThreadId === thread.id;
  const replyPending = replyingToThread && pendingThreadId === thread.id;
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
    navigate("../files", { relative: "path" });
  };

  return (
    <section
      className={`bg-surface-elevated border-border/60 w-full min-w-0 max-w-[min(100%,32rem)] border whitespace-normal ${selected ? "border-primary/40" : ""}`}
    >
      {/* Header - more compact */}
      <div className="border-border/60 flex items-center gap-2 border-b px-1 py-1">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={() => setCollapsed((current) => !current)}
          aria-label={collapsed ? "Expand thread" : "Collapse thread"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              className="text-[12px] font-semibold tracking-[-0.01em] hover:underline"
              onClick={openConversation}
            >
              {lineLabel}
            </button>
            <span className="text-muted-foreground text-[11px]">· {thread.comments.length}</span>
            {thread.isResolved ? (
              <span className="text-emerald-500 text-[10px]">
                <Check className="inline h-3 w-3" />
              </span>
            ) : (
              <span className="bg-amber-500/10 text-amber-500 rounded-full px-1.5 py-0 text-[9px] font-medium">
                open
              </span>
            )}
            {thread.isOutdated && (
              <span className="text-muted-foreground text-[10px]">outdated</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenFile ? (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onOpenFile}>
              <ExternalLink className="h-3 w-3" />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openConversation}>
              <MessagesSquare className="h-3 w-3" />
            </Button>
          )}
          {canResolveThreads && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={resolutionPending}
              onClick={toggleResolution}
            >
              <CheckCheck className={thread.isResolved ? "text-emerald-500 h-3 w-3" : "h-3 w-3"} />
            </Button>
          )}
        </div>
      </div>

      {collapsed ? null : (
        <div className="bg-background/30 w-full min-w-0">
          {/* Comments list - unified, compact */}
          <div className="flex w-full min-w-0 flex-col">
            {thread.comments.map((comment, index) => {
              const isRoot = index === 0;

              return (
                <div
                  key={comment.id}
                  className={`w-full min-w-0 px-3 py-3 ${!isRoot ? "border-border/40 border-t" : ""}`}
                >
                  <div className="flex w-full min-w-0 items-start gap-2.5">
                    {/* Compact avatar */}
                    {comment.author?.avatarUrl ? (
                      <img
                        src={comment.author.avatarUrl}
                        alt={comment.author.login}
                        className="border-border mt-0.5 h-5 w-5 shrink-0 rounded-full border"
                      />
                    ) : (
                      <div className="border-border bg-muted mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold">
                        {(comment.author?.login ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      {/* Compact header: name · time */}
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span className="text-[12px] font-medium">
                          {authorLabel(
                            comment.author?.login ?? null,
                            comment.author?.displayName ?? null,
                          )}
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          {formatRelativeTime(comment.createdAt)}
                        </span>
                      </div>

                      {/* Comment body - tighter with proper overflow handling */}
                      <div className="mt-1 min-w-0 max-w-full whitespace-normal [word-break:break-word] [overflow-wrap:anywhere]">
                        <div className="text-[13px] leading-5 [&_p]:!mb-1.5 [&_p]:!text-[13px] [&_p]:!leading-5 [&_p:last-child]:!mb-0 [&_li]:!text-[13px]">
                          <CommentBody body={comment.body} />
                        </div>
                      </div>

                      {/* Actions - minimal, inline */}
                      <div className="mt-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setReplyOpen(true);
                            setReplyDraft((current) => appendQuotedBody(current, comment.body));
                          }}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
                        >
                          <Quote className="h-3 w-3" />
                          Reply
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyToClipboard(comment.body, "Copied to clipboard")}
                          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors"
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reply form - compact */}
          {replyOpen ? (
            <div className="border-border/60 border-t px-3 py-3">
              <div className="space-y-2">
                <MarkdownEditor
                  value={replyDraft}
                  onChange={setReplyDraft}
                  placeholder="Reply..."
                  compact
                  mentions={mentions}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setReplyOpen(false);
                      setReplyDraft("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={replyPending || !replyDraft.trim()}
                    className="h-7 px-3 text-[11px]"
                    onClick={() => void submitReply()}
                  >
                    Reply
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* Quick reply trigger */
            <div className="border-border/60 border-t px-3 py-2">
              <button
                type="button"
                onClick={() => setReplyOpen(true)}
                className="text-muted-foreground hover:text-foreground hover:bg-surface-1 w-full rounded-md border border-dashed px-3 py-1.5 text-left text-[12px] transition-colors"
              >
                Reply to this thread...
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
