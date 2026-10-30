import { hasRepositoryEventBridge } from "@/features/source-control/repositoryFreshness";
import { ArrowDown, ArrowUp, ChevronDown, GitBranch, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToolbarAction } from "@/components/ui/toolbar-action";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCommandComposerLauncher } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import type { GitRepositoryState } from "@/platform/desktop/gitOperations";

import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";

export function GitRepositoryControls({ repoPath }: { repoPath: string }) {
  const openComposer = useCommandComposerLauncher();
  const { state } = useGetGitRepositoryStateQuery(repoPath, {
    selectFromResult: ({ currentData }) => ({ state: currentData }),
    pollingInterval: hasRepositoryEventBridge() ? 0 : 15000,
    refetchOnFocus: true,
  });
  const [, { busy }] = useRunGitCommandMutation({
    fixedCacheKey: repoPath,
    selectFromResult: ({ isLoading }) => ({ busy: isLoading }),
  });

  return <RepositoryControlButtons state={state} busy={busy} open={openComposer} />;
}

export function RepositoryControlButtons({
  state,
  busy,
  open,
}: {
  state: GitRepositoryState | undefined;
  busy: boolean;
  open: (action: ComposerAction) => void;
}) {
  const pushAction = state?.upstream ? "push" : "publish";

  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={300} disableHoverableContent>
      <div className="flex min-w-0 items-center gap-1" aria-busy={busy}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="toolbar"
              size="sm"
              className="min-w-0 flex-1 justify-start px-1 text-xs"
              aria-label={state?.branch ? `Switch branch: ${state.branch}` : "Switch branch"}
              aria-description={
                state?.upstream
                  ? `${state.ahead} outgoing commits, ${state.behind} incoming commits`
                  : undefined
              }
              onClick={() => open("switch-branch")}
            >
              <GitBranch className="size-3.5" />
              <span className="truncate">{state?.branch || "Branches"}</span>
              <ChevronDown className="size-3 shrink-0" />
              {state?.upstream ? (
                <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
                  {state.ahead > 0 ? `↑${state.ahead}` : null}
                  {state.ahead > 0 && state.behind > 0 ? " " : null}
                  {state.behind > 0 ? `↓${state.behind}` : null}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72 rounded-md text-left">
            <p className="font-medium">Switch branch</p>
            {state?.branch ? (
              <p className="text-muted-foreground mt-0.5 break-all">{state.branch}</p>
            ) : null}
          </TooltipContent>
        </Tooltip>
        <div role="group" aria-label="Remote actions" className="flex shrink-0 items-center gap-1">
          <ToolbarAction
            label="Fetch remote changes"
            description="Choose a remote to fetch from"
            disabledReason={remoteActionDisabledReason(state, busy, "fetch")}
            onClick={() => open("fetch")}
          >
            <RefreshCw />
          </ToolbarAction>
          <ToolbarAction
            label="Pull (fast-forward only)"
            description="Review the upstream branch before fast-forwarding"
            disabledReason={remoteActionDisabledReason(state, busy, "pull")}
            onClick={() => open("pull")}
          >
            <ArrowDown />
          </ToolbarAction>
          <ToolbarAction
            label={state?.upstream ? "Push commits" : "Publish branch"}
            description={
              state?.upstream
                ? `${state.ahead} outgoing ${state.ahead === 1 ? "commit" : "commits"} · choose a remote to push to`
                : "Set an upstream for this branch"
            }
            disabledReason={remoteActionDisabledReason(state, busy, pushAction)}
            onClick={() => open(pushAction)}
          >
            <ArrowUp />
          </ToolbarAction>
        </div>
      </div>
    </TooltipProvider>
  );
}

function remoteActionDisabledReason(
  state: GitRepositoryState | undefined,
  busy: boolean,
  action: "fetch" | "pull" | "push" | "publish",
): string | undefined {
  if (busy) return "A Git operation is in progress";
  if (!state) return "Repository status is not available yet. Refresh to try again.";
  if (action === "fetch")
    return state.remotes.length ? undefined : "No remote is configured for this repository";
  if (action === "publish") return state.branch ? undefined : "Check out a branch first";
  if (state.operation) return `Finish the current ${state.operation} first`;
  if (action === "pull") {
    if (!state.upstream) return "This branch has no upstream. Publish it first.";
    if (!state.behind) return "No incoming commits. Your branch is up to date.";
    if (state.ahead)
      return "Local and remote commits have diverged. Choose how to integrate them in Git commands.";
    return undefined;
  }
  if (!state.branch) return "Check out a branch first";
  if (state.behind) return "Integrate incoming commits before pushing";
  if (!state.ahead) return "No outgoing commits to push";
  return undefined;
}
