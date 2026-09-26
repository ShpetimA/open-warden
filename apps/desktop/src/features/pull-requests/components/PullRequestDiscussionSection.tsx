import {
  authorLabel,
  Avatar,
  CommentBody,
  toDisplayDate,
} from "@/features/pull-requests/components/pullRequestCommentParts";
import { SmilePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAddPullRequestReactionMutation } from "@/features/hosted-repos/api";
import type { PullRequestConversation } from "@/platform/desktop";

const reactionSymbols = {
  "+1": "👍",
  "-1": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
} as const;

function ReactionMenu({
  repoPath,
  pullRequestNumber,
  commentId,
}: {
  repoPath: string;
  pullRequestNumber: number;
  commentId: number;
}) {
  const [addReaction, mutation] = useAddPullRequestReactionMutation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon-xs"
          variant="ghost"
          disabled={mutation.isLoading}
          aria-label="Add reaction"
          title="Add reaction"
        >
          <SmilePlus />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {Object.entries(reactionSymbols).map(([content, symbol]) => (
          <DropdownMenuItem
            key={content}
            onSelect={() => {
              void addReaction({
                repoPath,
                pullRequestNumber,
                commentId,
                content: content as keyof typeof reactionSymbols,
              })
                .unwrap()
                .catch((cause: unknown) =>
                  toast.error(
                    cause && typeof cause === "object" && "message" in cause
                      ? String(cause.message)
                      : "Could not add reaction.",
                  ),
                );
            }}
          >
            {symbol} {content}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PullRequestDiscussionSection({
  conversation,
  repoPath,
}: {
  conversation: PullRequestConversation;
  repoPath: string;
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
              {conversation.detail.providerId === "github" || comment.reactions.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="Reactions">
                  {comment.reactions.map((reaction) => (
                    <span
                      key={reaction.content}
                      className="border-border bg-surface-toolbar rounded-full border px-2 py-0.5 text-xs tabular-nums"
                      title={`${reaction.content}: ${reaction.count}`}
                    >
                      {reactionSymbols[reaction.content]} {reaction.count}
                    </span>
                  ))}
                  {conversation.detail.providerId === "github" ? (
                    <ReactionMenu
                      repoPath={repoPath}
                      pullRequestNumber={conversation.detail.number}
                      commentId={comment.databaseId}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
