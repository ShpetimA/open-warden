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
import type { PullRequestIssueComment } from "@/platform/desktop";

type ReactionContent = PullRequestIssueComment["reactions"][number]["content"];

const reactionSymbols: Record<ReactionContent, string> = {
  "+1": "👍",
  "-1": "👎",
  laugh: "😄",
  hooray: "🎉",
  confused: "😕",
  heart: "❤️",
  rocket: "🚀",
  eyes: "👀",
};

export function CommentReactions({
  repoPath,
  pullRequestNumber,
  comment,
  canReact,
}: {
  repoPath: string;
  pullRequestNumber: number;
  comment: PullRequestIssueComment;
  canReact: boolean;
}) {
  const [addReaction, { isLoading }] = useAddPullRequestReactionMutation();

  function react(content: ReactionContent) {
    void addReaction({ repoPath, pullRequestNumber, commentId: comment.databaseId, content })
      .unwrap()
      .catch((cause: unknown) =>
        toast.error(
          cause && typeof cause === "object" && "message" in cause
            ? String(cause.message)
            : "Could not add reaction.",
        ),
      );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 px-4 pb-3" aria-label="Reactions">
      {comment.reactions.map((reaction) => (
        <button
          type="button"
          key={reaction.content}
          disabled={!canReact || isLoading}
          onClick={() => react(reaction.content)}
          className="border-border bg-surface-1 hover:border-primary/40 rounded-full border px-2 py-0.5 text-xs tabular-nums"
          title={`${reaction.content}: ${reaction.count}`}
        >
          {reactionSymbols[reaction.content]} {reaction.count}
        </button>
      ))}
      {canReact ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-xs"
              variant="ghost"
              disabled={isLoading}
              aria-label="Add reaction"
              title="Add reaction"
            >
              <SmilePlus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="flex min-w-0 gap-0.5 p-1">
            {(Object.keys(reactionSymbols) as ReactionContent[]).map((content) => (
              <DropdownMenuItem
                key={content}
                aria-label={content}
                className="px-1.5 text-base"
                onSelect={() => react(content)}
              >
                {reactionSymbols[content]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
