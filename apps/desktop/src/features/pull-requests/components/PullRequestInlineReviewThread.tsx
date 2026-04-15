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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
};

function providerTitle(providerId: GitProviderId) {
  if (providerId === "github") return "GitHub";
  if (providerId === "gitlab") return "GitLab";
  return "Bitbucket";
}

export function PullRequestInlineReviewThread({
  providerId,
  repoPath,
  pullRequestNumber,
  thread,
  onOpenFile,
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
  const compactButtonClass = "h-6 px-2 text-[11px] gap-1.5";
  const lineLabel = thread.line ?? thread.startLine ?? "Unknown";
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
      className={`border-border/60 border bg-surface-alt/55 ${
        selected ? "border-primary/30 bg-accent/15" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="text-muted-foreground inline-flex h-6 w-6 items-center justify-center rounded-none"
              onClick={() => {
                setCollapsed((current) => !current);
              }}
              aria-label={collapsed ? "Expand thread" : "Collapse thread"}
            >
              {collapsed ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )}
            </button>
            <button
              type="button"
              className="text-[13px] font-semibold hover:underline"
              onClick={openConversation}
            >
              Comment on line {lineLabel}
            </button>
            <div className="text-muted-foreground text-[11px]">
              {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
            </div>
            <div
              className={`rounded-none border px-2 py-0.5 text-[10px] font-medium ${
                thread.isResolved
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-200"
              }`}
            >
              {thread.isResolved ? "Resolved" : "Unresolved"}
            </div>
            {thread.isOutdated ? (
              <div className="border-border/70 bg-background text-muted-foreground rounded-none border px-2 py-0.5 text-[10px] font-medium">
                Outdated
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {onOpenFile ? (
            <Button variant="ghost" size="sm" className={compactButtonClass} onClick={onOpenFile}>
              <ExternalLink className="h-3 w-3" />
              Open file
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={compactButtonClass}
              onClick={openConversation}
            >
              <MessagesSquare className="h-3 w-3" />
              Conversation
            </Button>
          )}
          {canResolveThreads ? (
            <Button
              variant="ghost"
              size="sm"
              className={compactButtonClass}
              disabled={resolutionPending}
              onClick={toggleResolution}
            >
              <CheckCheck className="h-3 w-3" />
              {thread.isResolved ? "Reopen" : "Resolve"}
            </Button>
          ) : null}
        </div>
      </div>

      {collapsed ? null : (
        <div className="border-t border-border/60 bg-background/35">
          {rootComment ? (
            <div className="border-b border-border/50 px-3 py-3">
              <div className="flex items-start gap-3">
                <Avatar
                  login={rootComment.author?.login ?? null}
                  avatarUrl={rootComment.author?.avatarUrl ?? null}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="text-[13px] font-semibold">
                      {authorLabel(
                        rootComment.author?.login ?? null,
                        rootComment.author?.displayName ?? null,
                      )}
                    </div>
                    <div className="text-muted-foreground text-[11px]">
                      {toDisplayDate(rootComment.createdAt)}
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <CommentBody body={rootComment.body} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={compactButtonClass}
                      onClick={() => {
                        setReplyOpen(true);
                        setReplyDraft((current) => appendQuotedBody(current, rootComment.body));
                      }}
                    >
                      <CornerDownLeft className="h-3 w-3" />
                      Reply
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={compactButtonClass}
                      onClick={() =>
                        void copyToClipboard(rootComment.body, "Review comment copied")
                      }
                    >
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {replies.length > 0 ? (
            <div>
              {replies.map((reply) => (
                <div key={reply.id} className="border-t border-border/50 px-3 py-3">
                  <div className="flex items-start gap-3">
                    <Avatar
                      login={reply.author?.login ?? null}
                      avatarUrl={reply.author?.avatarUrl ?? null}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="text-[13px] font-semibold">
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
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() => {
                            setReplyOpen(true);
                            setReplyDraft((current) => appendQuotedBody(current, reply.body));
                          }}
                        >
                          <Quote className="h-3 w-3" />
                          Quote
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() => void copyToClipboard(reply.body, "Review reply copied")}
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {replyOpen ? (
            <div className="border-t border-border/60 px-3 py-3">
              <div className="space-y-2">
                <Textarea
                  value={replyDraft}
                  onChange={(event) => {
                    setReplyDraft(event.target.value);
                  }}
                  placeholder="Reply to this review thread..."
                  className="min-h-20 rounded-none text-[13px]"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className={compactButtonClass}
                    onClick={() => {
                      setReplyOpen(false);
                      setReplyDraft("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={replyPending}
                    className={compactButtonClass}
                    onClick={() => {
                      void submitReply();
                    }}
                  >
                    <MessagesSquare className="h-3 w-3" />
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
