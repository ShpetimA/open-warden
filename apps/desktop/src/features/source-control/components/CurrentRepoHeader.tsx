import { RepositoryResources } from "./RepositoryResources";
import { OpenInExternalEditor } from "@/features/source-control/components/OpenInExternalEditor";
import { repoLabel } from "@/features/source-control/utils";
import { GitRepositoryControls } from "./GitRepositoryControls";
import { useGetGitSnapshotQuery } from "../api";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCw } from "lucide-react";
import { ToolbarAction } from "@/components/ui/toolbar-action";
import { TooltipProvider } from "@/components/ui/tooltip";

type CurrentRepositoryHeaderProps = {
  activeRepo: string;
  activeBranch?: string;
  runningAction: string;
  onRefresh: () => void;
};

function CurrentRepositoryHeader({
  activeRepo,
  runningAction,
  onRefresh,
}: CurrentRepositoryHeaderProps) {
  return (
    <div className="border-border border-b px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="text-foreground/80 min-w-0 flex-1 truncate text-[13px] font-normal">
          {activeRepo ? repoLabel(activeRepo) : "No repo selected"}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <OpenInExternalEditor
            repoPath={activeRepo}
            target="repository"
            compact
            disabled={!!runningAction}
          />
          <RepositoryRefreshAction
            repoPath={activeRepo}
            runningAction={runningAction}
            onRefresh={onRefresh}
          />
        </div>
      </div>
      {activeRepo ? (
        <>
          <GitRepositoryControls key={activeRepo} repoPath={activeRepo} />
          <RepositoryResources key={`resources:${activeRepo}`} repoPath={activeRepo} />
        </>
      ) : null}
    </div>
  );
}

function RepositoryRefreshAction({
  repoPath,
  runningAction,
  onRefresh,
}: {
  repoPath: string;
  runningAction: string;
  onRefresh: () => void;
}) {
  const { refreshing } = useGetGitSnapshotQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ isFetching }) => ({ refreshing: isFetching }),
  });
  const busy = refreshing || Boolean(runningAction);
  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={300} disableHoverableContent>
      <ToolbarAction
        label="Refresh repository status"
        description="Reload local changes and branch status"
        disabledReason={
          !repoPath
            ? "Open a repository first"
            : runningAction
              ? "A Git operation is in progress"
              : refreshing
                ? "Refreshing repository status…"
                : undefined
        }
        aria-busy={busy}
        onClick={onRefresh}
      >
        {busy ? (
          <Spinner aria-hidden="true" className="size-3.5 motion-reduce:animate-none" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
      </ToolbarAction>
      {busy ? (
        <span role="status" className="sr-only">
          Updating repository status…
        </span>
      ) : null}
    </TooltipProvider>
  );
}

export default CurrentRepositoryHeader;
