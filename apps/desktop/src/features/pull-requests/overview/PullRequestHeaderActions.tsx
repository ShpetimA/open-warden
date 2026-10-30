import type { ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  FolderGit2,
  GitBranch,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { lifecycleLabels, type LifecycleAction } from "./PullRequestLifecycleDialog";

export type PullRequestHeaderAction =
  | "open-branch"
  | "open-worktree"
  | "open-browser"
  | "copy-link"
  | "copy-branch"
  | "refresh";

const destructiveActions = new Set<LifecycleAction>(["close", "revert"]);

/** One primary "Open" split button plus one overflow menu: every other action lives in it. */
export function PullRequestHeaderActions({
  refreshControl,
  lifecycleActions,
  opening,
  refreshing,
  onAction,
  onLifecycle,
}: {
  refreshControl?: ReactNode;
  lifecycleActions: LifecycleAction[];
  opening: "branch" | "worktree" | null;
  refreshing: boolean;
  onAction: (action: PullRequestHeaderAction) => void;
  onLifecycle: (action: LifecycleAction) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {refreshControl ?? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh pull request"
          title="Refresh"
          disabled={refreshing}
          onClick={() => onAction("refresh")}
        >
          <RefreshCw className={refreshing ? "animate-spin" : undefined} />
        </Button>
      )}
      <div className="flex items-center">
        <Button
          size="sm"
          className="rounded-r-none"
          disabled={opening !== null}
          onClick={() => onAction("open-branch")}
        >
          {opening === "branch" ? <LoaderCircle className="animate-spin" /> : <GitBranch />}
          Open branch
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              aria-label="More ways to open"
              disabled={opening !== null}
              className="border-primary-foreground/20 rounded-l-none border-l"
            >
              {opening === "worktree" ? <LoaderCircle className="animate-spin" /> : <ChevronDown />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuItem onSelect={() => onAction("open-branch")}>
              <GitBranch /> Check out branch
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAction("open-worktree")}>
              <FolderGit2 /> Open in new worktree
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction("open-browser")}>
              <ExternalLink /> Open in browser
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Pull request actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => onAction("copy-link")}>
            <Copy /> Copy link
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAction("copy-branch")}>
            <GitBranch /> Copy branch name
          </DropdownMenuItem>
          {lifecycleActions.length > 0 ? <DropdownMenuSeparator /> : null}
          {lifecycleActions.map((action) => (
            <DropdownMenuItem
              key={action}
              variant={destructiveActions.has(action) ? "destructive" : "default"}
              onSelect={() => onLifecycle(action)}
            >
              {lifecycleLabels[action]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
