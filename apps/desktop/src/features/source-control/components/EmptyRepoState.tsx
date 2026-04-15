import { ArrowUpRight, FolderOpen } from "lucide-react";

import { repoLabel, repoParentPath } from "@/features/source-control/utils";

type EmptyRepoStateProps = {
  recentRepos: string[];
  onOpenPicker: () => void;
  onOpenRepo: (repo: string) => void;
};

export function EmptyRepoState({ recentRepos, onOpenPicker, onOpenRepo }: EmptyRepoStateProps) {
  const previewRecentRepos = recentRepos.slice(0, 5);

  return (
    <div className="flex h-full items-center justify-center px-6">
      <div className="w-full max-w-[720px]">
        <div className="space-y-6">
          <div className="space-y-1.5">
            <div className="text-foreground text-[22px] font-semibold tracking-[-0.03em]">
              Open project
            </div>
            <p className="text-muted-foreground max-w-[480px] text-sm leading-6">
              Resume a recent repository or choose a folder to start working immediately.
            </p>
          </div>

          <button
            type="button"
            className="border-border/70 bg-surface-alt hover:bg-accent/45 group flex min-h-20 w-full max-w-[280px] items-center justify-between rounded-2xl border px-4 py-3 text-left transition-[transform,background-color,border-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
            onClick={onOpenPicker}
          >
            <div className="space-y-2">
              <div className="bg-background text-muted-foreground flex h-9 w-9 items-center justify-center rounded-xl border border-white/8">
                <FolderOpen className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Open project</div>
                <div className="text-muted-foreground text-xs">
                  Browse recent or choose a folder
                </div>
              </div>
            </div>
            <ArrowUpRight className="text-muted-foreground h-4 w-4 transition-transform duration-150 ease-[var(--ease-out)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>

          <div className="max-w-[720px]">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                Recent Projects
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                onClick={onOpenPicker}
              >
                View all ({recentRepos.length})
              </button>
            </div>

            {previewRecentRepos.length > 0 ? (
              <div className="space-y-1">
                {previewRecentRepos.map((repoPath) => (
                  <button
                    key={repoPath}
                    type="button"
                    className="hover:bg-accent/40 grid w-full grid-cols-[minmax(0,1fr)_minmax(0,280px)] items-center gap-4 rounded-xl px-3 py-2 text-left transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.995]"
                    onClick={() => onOpenRepo(repoPath)}
                  >
                    <span className="truncate text-[15px] font-medium">{repoLabel(repoPath)}</span>
                    <span className="text-muted-foreground truncate text-sm text-right">
                      {repoParentPath(repoPath)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="border-border/70 text-muted-foreground hover:text-foreground hover:bg-accent/35 inline-flex h-11 items-center rounded-xl border px-3 text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.99]"
                onClick={onOpenPicker}
              >
                Open a folder to start building your recent list.
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
