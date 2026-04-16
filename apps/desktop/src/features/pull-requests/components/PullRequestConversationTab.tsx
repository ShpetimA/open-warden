import { useState } from "react";
import {
  CheckCheck,
  Copy,
  CornerDownLeft,
  ExternalLink,
  FileCode2,
  MessageSquarePlus,
  MessagesSquare,
  Quote,
} from "lucide-react";
import { toast } from "sonner";

import { MarkdownEditor } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import {
  useAddPullRequestCommentMutation,
  useReplyToPullRequestThreadMutation,
  useSetPullRequestThreadResolvedMutation,
} from "@/features/hosted-repos/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import {
  appendQuotedBody,
  authorLabel,
  Avatar,
  CommentBody,
  copyRemoteCommentsToClipboard,
  copyToClipboard,
  toDisplayDate,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import type {
  GitProviderId,
  PullRequestConversation,
  PullRequestIssueComment,
  PullRequestReviewThread,
} from "@/platform/desktop";

type PullRequestConversationTabProps = {
  providerId: GitProviderId;
  repoPath: string;
  pullRequestNumber: number;
  conversation: PullRequestConversation;
  activeThreadId: string | null;
  onSelectThread: (threadId: string | null) => void;
  onJumpToThread: (thread: PullRequestReviewThread) => void;
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

type ConversationEntry =
  | { kind: "description"; createdAt: string }
  | { kind: "issue-comment"; comment: PullRequestIssueComment; createdAt: string }
  | { kind: "review-thread"; thread: PullRequestReviewThread; createdAt: string };

function conversationEntries(conversation: PullRequestConversation): ConversationEntry[] {
  const entries: ConversationEntry[] = [];

  if (conversation.detail.body.trim()) {
    entries.push({
      kind: "description",
      createdAt: conversation.detail.createdAt,
    });
  }

  for (const comment of conversation.issueComments) {
    entries.push({
      kind: "issue-comment",
      comment,
      createdAt: comment.createdAt,
    });
  }

  for (const thread of conversation.reviewThreads) {
    entries.push({
      kind: "review-thread",
      thread,
      createdAt: thread.comments[0]?.createdAt ?? conversation.detail.createdAt,
    });
  }

  return entries.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function EntryCard({
  children,
  highlighted = false,
}: {
  children: React.ReactNode;
  highlighted?: boolean;
}) {
  return (
    <section
      className={`border-border/60 bg-surface-elevated border ${
        highlighted ? "border-primary/40" : ""
      }`}
    >
      {children}
    </section>
  );
}

export function PullRequestConversationTab({
  providerId,
  repoPath,
  pullRequestNumber,
  conversation,
  activeThreadId,
  onSelectThread,
  onJumpToThread,
}: PullRequestConversationTabProps) {
  const [topLevelDraft, setTopLevelDraft] = useState("");
  const [replyThreadId, setReplyThreadId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [addPullRequestComment, { isLoading: addingComment }] = useAddPullRequestCommentMutation();
  const [replyToPullRequestThread, { isLoading: replyingToThread }] =
    useReplyToPullRequestThreadMutation();
  const [setPullRequestThreadResolved, { isLoading: updatingThreadResolution }] =
    useSetPullRequestThreadResolvedMutation();
  const compactButtonClass =
    "border-border/60 bg-black/10 hover:bg-black/20 h-7 gap-1.5 rounded-full border px-3 text-[11px] font-medium text-foreground/90";
  const providerName = providerTitle(providerId);
  const canResolveThreads = providerId === "github" || providerId === "bitbucket";
  const mentionConfig = usePullRequestMentionCandidates(conversation);

  const entries = conversationEntries(conversation);

  async function submitTopLevelComment() {
    const body = topLevelDraft.trim();
    if (!body) {
      return;
    }

    try {
      await addPullRequestComment({
        repoPath,
        pullRequestNumber,
        body,
      }).unwrap();
      setTopLevelDraft("");
      setComposerOpen(false);
      toast.success(`Comment posted to ${providerName}`);
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to post comment"));
    }
  }

  async function submitThreadReply(threadId: string) {
    const body = replyDraft.trim();
    if (!body) {
      return;
    }

    try {
      setPendingThreadId(threadId);
      await replyToPullRequestThread({
        repoPath,
        pullRequestNumber,
        threadId,
        body,
      }).unwrap();
      setReplyDraft("");
      setReplyThreadId(null);
      toast.success(`Reply posted to ${providerName}`);
    } catch (error) {
      toast.error(errorMessageFrom(error, "Failed to post reply"));
    } finally {
      setPendingThreadId(null);
    }
  }

  async function toggleThreadResolution(thread: PullRequestReviewThread) {
    try {
      setPendingThreadId(thread.id);
      await setPullRequestThreadResolved({
        repoPath,
        pullRequestNumber,
        threadId: thread.id,
        resolved: !thread.isResolved,
      }).unwrap();
      toast.success(thread.isResolved ? "Thread reopened" : "Thread resolved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingThreadId(null);
    }
  }

  return (
    <div className="h-full overflow-auto px-5 py-4">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3">
        <EntryCard>
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold tracking-[-0.01em]">
                Review conversation
              </div>
              <div className="text-muted-foreground mt-1 text-[12px] leading-5">
                {providerName} comments and review threads for this pull request. Use quote or copy
                to move context into your own replies.
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              <Button
                variant="outline"
                size="sm"
                className={compactButtonClass}
                onClick={() => {
                  void copyRemoteCommentsToClipboard(conversation);
                }}
              >
                <Copy className="h-3 w-3" />
                Copy remote comments
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={compactButtonClass}
                onClick={() => {
                  setComposerOpen((current) => !current);
                }}
              >
                <MessageSquarePlus className="h-3 w-3" />
                Comment
              </Button>
            </div>
          </div>

          {composerOpen ? (
            <div className="border-border/60 mt-1 space-y-3 border-t px-4 py-4">
              <MarkdownEditor
                value={topLevelDraft}
                onChange={setTopLevelDraft}
                placeholder="Add a top-level pull request comment..."
                compact
                mentions={mentionConfig}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  className="rounded-none px-2"
                  onClick={() => {
                    setComposerOpen(false);
                    setTopLevelDraft("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  disabled={addingComment}
                  className="rounded-full px-3"
                  onClick={() => void submitTopLevelComment()}
                >
                  Post comment
                </Button>
              </div>
            </div>
          ) : null}
        </EntryCard>

        {entries.map((entry, index) => {
          if (entry.kind === "description") {
            const author = conversation.detail.author;
            return (
              <EntryCard key={`description-${index}`}>
                <div className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Avatar login={author?.login ?? null} avatarUrl={author?.avatarUrl ?? null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="text-[13px] font-semibold tracking-[-0.01em]">
                          {authorLabel(author?.login ?? null, author?.displayName ?? null)}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          opened this pull request
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          {toDisplayDate(conversation.detail.createdAt)}
                        </div>
                      </div>
                      <div className="mt-2">
                        <CommentBody body={conversation.detail.body} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() => {
                            setComposerOpen(true);
                            setTopLevelDraft((current) =>
                              appendQuotedBody(current, conversation.detail.body),
                            );
                          }}
                        >
                          <Quote className="h-3.5 w-3.5" />
                          Quote
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() =>
                            void copyToClipboard(conversation.detail.body, "PR description copied")
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </EntryCard>
            );
          }

          if (entry.kind === "issue-comment") {
            const author = entry.comment.author;
            return (
              <EntryCard key={entry.comment.id}>
                <div className="px-4 py-4">
                  <div className="flex items-start gap-3">
                    <Avatar login={author?.login ?? null} avatarUrl={author?.avatarUrl ?? null} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="text-[13px] font-semibold tracking-[-0.01em]">
                          {authorLabel(author?.login ?? null, author?.displayName ?? null)}
                        </div>
                        <div className="text-muted-foreground text-[11px]">
                          commented {toDisplayDate(entry.comment.createdAt)}
                        </div>
                      </div>
                      <div className="mt-2">
                        <CommentBody body={entry.comment.body} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() => {
                            setComposerOpen(true);
                            setTopLevelDraft((current) =>
                              appendQuotedBody(current, entry.comment.body),
                            );
                          }}
                        >
                          <Quote className="h-3.5 w-3.5" />
                          Quote reply
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() =>
                            void copyToClipboard(entry.comment.body, `${providerName} comment copied`)
                          }
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                        {entry.comment.url ? (
                          <Button variant="ghost" size="sm" className={compactButtonClass} asChild>
                            <a href={entry.comment.url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                              Open
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </EntryCard>
            );
          }

          const thread = entry.thread;
          const rootComment = thread.comments[0] ?? null;
          const replies = thread.comments.slice(1);
          const resolutionPending = updatingThreadResolution && pendingThreadId === thread.id;
          const replyPending = replyingToThread && pendingThreadId === thread.id;
          const selected = activeThreadId === thread.id;

          return (
            <EntryCard key={thread.id} highlighted={selected}>
              <div className="border-border/60 flex items-start justify-between gap-3 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <button
                      type="button"
                      className="text-[12px] font-semibold tracking-[-0.01em] hover:underline"
                      onClick={() => {
                        onSelectThread(thread.id);
                        onJumpToThread(thread);
                      }}
                    >
                      {thread.path}
                    </button>
                    <div className="text-muted-foreground text-[11px]">{threadLineLabel(thread)}</div>
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
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={compactButtonClass}
                    onClick={() => {
                      onSelectThread(thread.id);
                      onJumpToThread(thread);
                    }}
                  >
                    <FileCode2 className="h-3.5 w-3.5" />
                    Open file
                  </Button>
                  {canResolveThreads ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={compactButtonClass}
                      disabled={resolutionPending}
                      onClick={() => {
                        void toggleThreadResolution(thread);
                      }}
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {thread.isResolved ? "Reopen" : "Resolve"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {rootComment ? (
                <div className="px-4 py-4">
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
                          className={compactButtonClass}
                          onClick={() => {
                            setReplyThreadId(thread.id);
                            setReplyDraft((current) => appendQuotedBody(current, rootComment.body));
                            onSelectThread(thread.id);
                          }}
                        >
                          <CornerDownLeft className="h-3.5 w-3.5" />
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
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {replies.length > 0 ? (
                <div className="border-border/40 border-t px-4 py-3">
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
                              className={compactButtonClass}
                              onClick={() => {
                                setReplyThreadId(thread.id);
                                setReplyDraft((current) => appendQuotedBody(current, reply.body));
                                onSelectThread(thread.id);
                              }}
                            >
                              <Quote className="h-3.5 w-3.5" />
                              Quote
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={compactButtonClass}
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

              {replyThreadId === thread.id ? (
                <div className="border-border/60 border-t px-4 py-4">
                  <div className="space-y-3">
                    <MarkdownEditor
                      value={replyDraft}
                      onChange={setReplyDraft}
                      placeholder="Reply to this review thread..."
                      compact
                      mentions={mentionConfig}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        className="h-7 rounded-none px-2 text-[12px]"
                        onClick={() => {
                          setReplyThreadId(null);
                          setReplyDraft("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        disabled={replyPending}
                        className="h-7 rounded-full px-3 text-[12px]"
                        onClick={() => {
                          void submitThreadReply(thread.id);
                        }}
                      >
                        <MessagesSquare className="h-3.5 w-3.5" />
                        Reply
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </EntryCard>
          );
        })}
      </div>
    </div>
  );
}
