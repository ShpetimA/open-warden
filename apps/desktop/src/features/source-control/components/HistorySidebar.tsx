import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { refreshActiveRepo } from "@/features/source-control/actions";
import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import { HistoryCommitList } from "@/features/source-control/components/HistoryCommitList";
import { setHistoryNavTarget } from "@/features/source-control/sourceControlSlice";

type HistorySidebarProps = {
  activeBranch?: string;
};

export function HistorySidebar({ activeBranch }: HistorySidebarProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);

  return (
    <aside
      onMouseDown={() => {
        dispatch(setHistoryNavTarget("commits"));
      }}
      className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CurrentRepositoryHeader
          activeRepo={activeRepo}
          activeBranch={activeBranch}
          runningAction={runningAction}
          onRefresh={() => {
            void dispatch(refreshActiveRepo());
          }}
        />

        <HistoryCommitList />
      </div>
    </aside>
  );
}
