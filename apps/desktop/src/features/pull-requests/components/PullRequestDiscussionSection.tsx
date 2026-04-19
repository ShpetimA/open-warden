import {
  authorLabel,
  Avatar,
  CommentBody,
  toDisplayDate,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import type { PullRequestConversation } from "@/platform/desktop";

export function PullRequestDiscussionSection({
  conversation,
}: {
  conversation: PullRequestConversation;
}) {
  const hasDescription = conversation.detail.body.trim().length > 0;
  const hasComments = conversation.issueComments.length > 0;

  if (!hasDescription && !hasComments) {
    return null;
  }

  return (
    <section className="rounded-lg border border-border/70 bg-surface-0 p-5">
      <div className="text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase">
        Discussion
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {hasDescription ? (
          <div className="flex items-start gap-3">
            <Avatar
              login={conversation.detail.author?.login ?? null}
              avatarUrl={conversation.detail.author?.avatarUrl ?? null}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <div className="font-medium">
                  {authorLabel(
                    conversation.detail.author?.login ?? null,
                    conversation.detail.author?.displayName ?? null,
                  )}
                </div>
                <div className="text-muted-foreground text-xs">
                  opened this PR {toDisplayDate(conversation.detail.createdAt)}
                </div>
              </div>
              <div className="mt-2">
                <CommentBody body={conversation.detail.body} />
              </div>
            </div>
          </div>
        ) : null}

        {conversation.issueComments.map((comment) => (
          <div
            key={comment.id}
            className="border-border/60 flex items-start gap-3 border-t pt-4 first:border-t-0 first:pt-0"
          >
            <Avatar
              login={comment.author?.login ?? null}
              avatarUrl={comment.author?.avatarUrl ?? null}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <div className="font-medium">
                  {authorLabel(comment.author?.login ?? null, comment.author?.displayName ?? null)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {toDisplayDate(comment.createdAt)}
                </div>
              </div>
              <div className="mt-2">
                <CommentBody body={comment.body} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
