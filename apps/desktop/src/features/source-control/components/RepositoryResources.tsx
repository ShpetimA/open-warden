import {
  Archive,
  ExternalLink,
  FolderGit2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  Tag,
  Trash2,
} from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { readDesktopFailure } from "@/platform/desktop/failure";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCommandComposerLauncher } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import type { GitRepositoryState } from "@/platform/desktop/gitOperations";
import { openRepo } from "../actions";
import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";

type Props = {
  repoPath: string;
  state: Pick<GitRepositoryState, "stashes" | "tags" | "worktrees"> | undefined;
  busy: boolean;
  loading: boolean;
  error?: unknown;
  onAction: (action: ComposerAction) => void;
  onOpenWorktree: (path: string) => void;
  onRetry: () => void;
};

function ResourceReadState({
  loading,
  error,
  onRetry,
}: Pick<Props, "loading" | "error" | "onRetry">) {
  if (error) {
    return (
      <>
        <DropdownMenuLabel className="text-xs font-medium">
          Repository tools unavailable
        </DropdownMenuLabel>
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal whitespace-normal">
          {readDesktopFailure(error)?.message ?? "The repository status could not be read."}
        </DropdownMenuLabel>
        <DropdownMenuItem
          disabled={loading}
          onSelect={(event) => {
            event.preventDefault();
            onRetry();
          }}
        >
          <RefreshCw />
          {loading ? "Refreshing status…" : "Refresh status"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    );
  }

  return (
    <DropdownMenuItem disabled className="text-muted-foreground">
      <Spinner />
      Loading repository tools…
    </DropdownMenuItem>
  );
}

export function RepositoryResourcesView(props: Props) {
  const { state } = props;
  const hasStashes = Boolean(state?.stashes.length);
  const hasTags = Boolean(state?.tags.length);
  const removableWorktrees = state?.worktrees.some((item) => item.path !== props.repoPath);

  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={300} disableHoverableContent>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="toolbar" size="icon-sm" aria-label="Repository tools">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Stashes, tags, worktrees and remotes</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-72" aria-busy={props.loading}>
          {!state || props.error ? <ResourceReadState {...props} /> : null}
          <DropdownMenuLabel className="text-muted-foreground flex items-center justify-between text-[11px] font-medium">
            Stashes
            <span className="tabular-nums">{state?.stashes.length ?? "…"}</span>
          </DropdownMenuLabel>
          <div>
            {state ? (
              <>
                <DropdownMenuItem
                  disabled={props.busy}
                  onSelect={() => props.onAction("save-stash")}
                >
                  <Plus />
                  Save changes as stash…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {!hasStashes ? (
                  <p className="text-muted-foreground px-2 py-2 text-xs">No saved stashes.</p>
                ) : null}
                <DropdownMenuItem
                  disabled={props.busy || !hasStashes}
                  onSelect={() => props.onAction("apply-stash")}
                >
                  <Archive />
                  Apply stash…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={props.busy || !hasStashes}
                  onSelect={() => props.onAction("pop-stash")}
                >
                  <Archive />
                  Apply and delete stash…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={props.busy || !hasStashes}
                  onSelect={() => props.onAction("drop-stash")}
                >
                  <Trash2 />
                  Delete stash…
                </DropdownMenuItem>
              </>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground flex items-center justify-between text-[11px] font-medium">
            Tags
            <span className="tabular-nums">{state?.tags.length ?? "…"}</span>
          </DropdownMenuLabel>
          <div>
            {state ? (
              <>
                {!hasTags ? (
                  <p className="text-muted-foreground px-2 py-2 text-xs">No local tags.</p>
                ) : null}
                <DropdownMenuItem
                  disabled={props.busy || !hasTags}
                  onSelect={() => props.onAction("view-tags")}
                >
                  <Tag />
                  Browse tags…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={props.busy}
                  onSelect={() => props.onAction("create-tag")}
                >
                  <Plus />
                  Create tag…
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={props.busy || !hasTags}
                  onSelect={() => props.onAction("delete-tag")}
                >
                  <Trash2 />
                  Delete tag…
                </DropdownMenuItem>
              </>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-muted-foreground flex items-center justify-between text-[11px] font-medium">
            Worktrees
            <span className="tabular-nums">{state?.worktrees.length ?? "…"}</span>
          </DropdownMenuLabel>
          <div>
            {state ? (
              <>
                <div>
                  {state.worktrees.map((worktree) => (
                    <DropdownMenuItem
                      key={worktree.path}
                      disabled={props.busy || worktree.path === props.repoPath}
                      onSelect={() => props.onOpenWorktree(worktree.path)}
                      title={worktree.path}
                    >
                      <FolderGit2 className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs">
                          {worktree.branch || worktree.commitId.slice(0, 8)}
                          {worktree.path === props.repoPath ? " (current)" : ""}
                        </p>
                        <p className="text-muted-foreground truncate text-[11px]">
                          {worktree.path}
                        </p>
                      </div>
                      {worktree.path !== props.repoPath ? (
                        <ExternalLink className="size-3" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={props.busy}
                  onSelect={() => props.onAction("create-worktree")}
                >
                  <Plus />
                  Create worktree…
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={props.busy || !removableWorktrees}
                  onSelect={() => props.onAction("remove-worktree")}
                >
                  <Trash2 />
                  Remove worktree…
                </DropdownMenuItem>
              </>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={props.busy} onSelect={() => props.onAction("manage-remotes")}>
            <Settings2 />
            Remotes &amp; upstream…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
}

export function RepositoryResources({ repoPath }: { repoPath: string }) {
  const dispatch = useAppDispatch();
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const openComposer = useCommandComposerLauncher();
  const { stashes, tags, worktrees, loading, error, refetch } = useGetGitRepositoryStateQuery(
    repoPath,
    {
      selectFromResult: ({ currentData, isFetching, error }) => ({
        stashes: currentData?.stashes,
        tags: currentData?.tags,
        worktrees: currentData?.worktrees,
        loading: isFetching,
        error,
      }),
    },
  );
  const [, { busy }] = useRunGitCommandMutation({
    fixedCacheKey: repoPath,
    selectFromResult: ({ isLoading }) => ({ busy: isLoading }),
  });

  return (
    <RepositoryResourcesView
      repoPath={repoPath}
      state={stashes && tags && worktrees ? { stashes, tags, worktrees } : undefined}
      loading={loading}
      error={error}
      busy={busy || Boolean(runningAction)}
      onAction={openComposer}
      onOpenWorktree={(path) => {
        void dispatch(openRepo(path));
      }}
      onRetry={() => {
        void refetch();
      }}
    />
  );
}
