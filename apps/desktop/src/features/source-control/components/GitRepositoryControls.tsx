import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useCommandComposerLauncher } from "@/features/command-palette/CommandComposerLauncher";
import type { ComposerAction } from "@/features/command-palette/commandComposerModel";
import type { GitRepositoryState } from "@/platform/desktop/gitOperations";

import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";

export function GitRepositoryControls({ repoPath }: { repoPath: string }) {
  const openComposer = useCommandComposerLauncher();
  const { currentData: state } = useGetGitRepositoryStateQuery(repoPath, {
    pollingInterval: 15000,
    refetchOnFocus: true,
  });
  const [, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });

  return <RepositoryControlButtons state={state} busy={mutation.isLoading} open={openComposer} />;
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
  const pullReady = Boolean(state?.upstream && state.behind && !state.ahead && !state.operation);
  const pushReady = Boolean(state?.branch && state.ahead && !state.behind && !state.operation);

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-start px-0 text-xs"
        onClick={() => open("switch-branch")}
        title="Switch branch"
      >
        <GitBranch className="size-3.5" />
        <span className="truncate">{state?.branch || "Branches"}</span>
        {state?.upstream ? (
          <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
            ↑{state.ahead} ↓{state.behind}
          </span>
        ) : null}
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        title="Fetch remote changes"
        aria-label="Fetch remote changes"
        disabled={busy || !state?.remotes.length}
        onClick={() => open("fetch")}
      >
        <RefreshCw />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        title="Pull (fast-forward only)"
        aria-label="Pull (fast-forward only)"
        disabled={busy || !pullReady}
        onClick={() => open("pull")}
      >
        <ArrowDown />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        title={state?.upstream ? "Push commits" : "Publish branch"}
        aria-label={state?.upstream ? "Push commits" : "Publish branch"}
        disabled={busy || (!pushReady && (Boolean(state?.upstream) || !state?.branch))}
        onClick={() => open(state?.upstream ? "push" : "publish")}
      >
        <ArrowUp />
      </Button>
    </div>
  );
}
