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

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      className={`border-border/60 border bg-surface-alt/55 p-3 ${
        highlighted ? "border-primary/30 bg-accent/15" : ""
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
  const compactButtonClass = "h-6 px-2 text-[11px] gap-1.5";
  const providerName = providerTitle(providerId);
  const canResolveThreads = providerId === "github" || providerId === "bitbucket";

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold tracking-[-0.01em]">
                Review conversation
              </div>
              <div className="text-muted-foreground mt-1 text-[12px] leading-5">
                {providerName} comments and review threads for this pull request. Use quote or copy
                to move context into your own replies.
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
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
            <div className="mt-4 space-y-3">
              <Textarea
                value={topLevelDraft}
                onChange={(event) => {
                  setTopLevelDraft(event.target.value);
                }}
                placeholder="Add a top-level pull request comment..."
                className="min-h-28"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setComposerOpen(false);
                    setTopLevelDraft("");
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={addingComment} onClick={() => void submitTopLevelComment()}>
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
                <div className="flex items-start gap-3">
                  <Avatar login={author?.login ?? null} avatarUrl={author?.avatarUrl ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="text-[13px] font-semibold">
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
                    <div className="mt-2 flex flex-wrap gap-2">
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
                        <Quote className="h-3 w-3" />
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
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
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
                <div className="flex items-start gap-3">
                  <Avatar login={author?.login ?? null} avatarUrl={author?.avatarUrl ?? null} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <div className="text-[13px] font-semibold">
                        {authorLabel(author?.login ?? null, author?.displayName ?? null)}
                      </div>
                      <div className="text-muted-foreground text-[11px]">
                        commented {toDisplayDate(entry.comment.createdAt)}
                      </div>
                    </div>
                    <div className="mt-2">
                      <CommentBody body={entry.comment.body} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
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
                        <Quote className="h-3 w-3" />
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
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                      {entry.comment.url ? (
                        <Button variant="ghost" size="sm" className={compactButtonClass} asChild>
                          <a href={entry.comment.url} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3 w-3" />
                            Open
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </EntryCard>
            );
          }

          const thread = entry.thread;
          const rootComment = thread.comments[0] ?? null;
          const replies = thread.comments.slice(1);
          const resolutionPending =
            updatingThreadResolution && pendingThreadId === thread.id;
          const replyPending = replyingToThread && pendingThreadId === thread.id;
          const selected = activeThreadId === thread.id;

          return (
            <EntryCard key={thread.id} highlighted={selected}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="text-[13px] font-semibold hover:underline"
                      onClick={() => {
                        onSelectThread(thread.id);
                        onJumpToThread(thread);
                      }}
                    >
                      {thread.path}
                    </button>
                    <div className="text-muted-foreground text-[11px]">
                      {thread.line ?? thread.startLine ?? "Unknown line"}
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
                  <div className="text-muted-foreground mt-1 text-[11px]">
                    {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={compactButtonClass}
                    onClick={() => {
                      onSelectThread(thread.id);
                      onJumpToThread(thread);
                    }}
                  >
                    <FileCode2 className="h-3 w-3" />
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
                      <CheckCheck className="h-3 w-3" />
                      {thread.isResolved ? "Reopen" : "Resolve"}
                    </Button>
                  ) : null}
                </div>
              </div>

              {rootComment ? (
                <div className="mt-3 flex items-start gap-3">
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
                    <div className="mt-2">
                      <CommentBody body={rootComment.body} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
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
              ) : null}

              {replies.length > 0 ? (
                <div className="mt-3 space-y-2 border-l border-border/60 pl-3">
                  {replies.map((reply) => (
                    <div key={reply.id} className="flex items-start gap-3 border-t border-border/50 pt-3 first:border-t-0 first:pt-0">
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
                        <div className="mt-1.5 flex flex-wrap gap-2">
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
                          <Quote className="h-3 w-3" />
                          Quote
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={compactButtonClass}
                          onClick={() =>
                            void copyToClipboard(reply.body, "Review reply copied")
                          }
                        >
                          <Copy className="h-3 w-3" />
                          Copy
                        </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              {replyThreadId === thread.id ? (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
                  <Textarea
                    value={replyDraft}
                    onChange={(event) => {
                      setReplyDraft(event.target.value);
                    }}
                    placeholder="Reply to this review thread..."
                    className="min-h-20 rounded-none"
                  />
                  <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    className={compactButtonClass}
                    onClick={() => {
                      setReplyThreadId(null);
                      setReplyDraft("");
                    }}
                  >
                      Cancel
                    </Button>
                  <Button
                    disabled={replyPending}
                    className={compactButtonClass}
                    onClick={() => {
                      void submitThreadReply(thread.id);
                    }}
                  >
                    <MessagesSquare className="h-3 w-3" />
                    Reply
                  </Button>
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
