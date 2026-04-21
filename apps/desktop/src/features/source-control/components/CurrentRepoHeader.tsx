import { OpenInExternalEditor } from "@/features/source-control/components/OpenInExternalEditor";
import { repoLabel } from "@/features/source-control/utils";
import { GitBranch, RefreshCw } from "lucide-react";

type CurrentRepositoryHeaderProps = {
  activeRepo: string;
  activeBranch?: string;
  runningAction: string;
  onRefresh: () => void;
};

function CurrentRepositoryHeader({
  activeRepo,
  activeBranch,
  runningAction,
  onRefresh,
}: CurrentRepositoryHeaderProps) {
  const branchLabel = activeBranch || "Detached HEAD";

  return (
    <div className="border-border border-b px-3 py-1.5">
      <div className="flex items-center gap-2">
        <div className="text-foreground/80 text-[13px] font-normal">
          <span>{activeRepo ? repoLabel(activeRepo) : "No repo selected"}</span>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <OpenInExternalEditor
            repoPath={activeRepo}
            target="repository"
            compact
            disabled={!!runningAction}
          />
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center"
            title="Refresh repository status"
            aria-label="Refresh repository status"
            disabled={!activeRepo || !!runningAction}
            onClick={onRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="text-muted-foreground flex min-w-0 items-center gap-1 text-xs">
        {activeRepo ? (
          <>
            <GitBranch className="h-3 w-3 shrink-0" />
            <span className="truncate">{branchLabel}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default CurrentRepositoryHeader;
