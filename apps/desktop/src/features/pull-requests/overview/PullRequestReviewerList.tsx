import { RotateCcw, UserPlus, X } from "lucide-react";
import { useState } from "react";

import type { MentionCandidate } from "@/components/markdown/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RelativeTime } from "@/components/ui/relative-time";
import { UserAvatar } from "@/components/ui/user-avatar";

import { ReviewerStateIcon } from "./status";
import type { ReviewerView } from "./types";

const stateLabel: Record<ReviewerView["state"], string> = {
  approved: "approved",
  "changes-requested": "requested changes",
  commented: "commented",
  requested: "waiting",
};

function AddReviewerPopover({
  candidates,
  existing,
  onAdd,
}: {
  candidates: MentionCandidate[];
  existing: Set<string>;
  onAdd: (login: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const normalized = query.trim().toLowerCase();
  const suggestions = candidates
    .filter((candidate) => !existing.has(candidate.id))
    .filter((candidate) => !normalized || candidate.label.toLowerCase().includes(normalized))
    .slice(0, 6);

  async function add(login: string) {
    if (!login.trim() || saving) return;
    setSaving(true);
    const added = await onAdd(login.trim());
    setSaving(false);
    if (added) {
      setQuery("");
      setOpen(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground hover:bg-surface-1 -mx-2 mt-0.5 flex min-h-8 items-center gap-2 rounded-md px-2 text-[13px]"
        >
          <UserPlus className="size-4" />
          Add reviewer
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void add(query);
          }}
        >
          <Input
            autoFocus
            aria-label="Reviewer username"
            placeholder="Username"
            value={query}
            disabled={saving}
            onChange={(event) => setQuery(event.target.value)}
            className="h-8 text-sm"
          />
        </form>
        {suggestions.length > 0 ? (
          <ul className="mt-1 flex flex-col">
            {suggestions.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void add(candidate.id)}
                  className="hover:bg-surface-1 flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[13px]"
                >
                  <UserAvatar
                    login={candidate.id}
                    name={candidate.label}
                    avatarUrl={candidate.avatarUrl}
                    size="sm"
                  />
                  {candidate.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground px-2 pt-2 text-xs">
            Press Enter to request a review.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function PullRequestReviewerList({
  reviewers,
  candidates = [],
  onAdd,
  onRerequest,
  onRemove,
}: {
  reviewers: ReviewerView[];
  candidates?: MentionCandidate[];
  onAdd?: (login: string) => Promise<boolean>;
  onRerequest?: (reviewer: ReviewerView) => void;
  onRemove?: (reviewer: ReviewerView) => void;
}) {
  return (
    <div className="flex flex-col">
      {reviewers.length === 0 ? (
        <p className="text-muted-foreground py-1 text-xs">Nobody has been asked to review yet.</p>
      ) : null}
      {reviewers.map((reviewer) => (
        <div
          key={reviewer.id}
          className="group hover:bg-surface-1 -mx-2 flex min-h-8 items-center gap-2 rounded-md px-2"
        >
          <UserAvatar
            login={reviewer.login}
            name={reviewer.name}
            avatarUrl={reviewer.avatarUrl}
            size="sm"
          />
          <div className="min-w-0 flex-1 truncate text-[13px]">
            {reviewer.name ?? reviewer.login}
          </div>
          <span className="text-muted-foreground text-[11px] group-hover:hidden">
            {reviewer.reviewedAt ? (
              <RelativeTime value={reviewer.reviewedAt} prefix={stateLabel[reviewer.state]} />
            ) : (
              stateLabel[reviewer.state]
            )}
          </span>
          <span className="hidden items-center group-hover:flex">
            {onRerequest && reviewer.state !== "requested" ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Re-request review from ${reviewer.login}`}
                title="Re-request review"
                onClick={() => onRerequest(reviewer)}
              >
                <RotateCcw />
              </Button>
            ) : null}
            {onRemove && reviewer.state === "requested" ? (
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${reviewer.login}`}
                title="Remove reviewer"
                onClick={() => onRemove(reviewer)}
              >
                <X />
              </Button>
            ) : null}
          </span>
          <ReviewerStateIcon state={reviewer.state} />
        </div>
      ))}
      {onAdd ? (
        <AddReviewerPopover
          candidates={candidates}
          existing={new Set(reviewers.map((reviewer) => reviewer.login))}
          onAdd={onAdd}
        />
      ) : null}
    </div>
  );
}
