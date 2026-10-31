import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { refreshActiveRepo } from "@/features/source-control/actions";
import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import { ChangesTab } from "@/features/source-control/components/ChangesTab";

export function ChangesSidebar() {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ChangesRepositoryHeader activeRepo={activeRepo} />

        <ChangesTab />
      </div>
    </aside>
  );
}

function ChangesRepositoryHeader({ activeRepo }: { activeRepo: string }) {
  const dispatch = useAppDispatch();
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  return (
    <CurrentRepositoryHeader
      activeRepo={activeRepo}
      runningAction={runningAction}
      onRefresh={() => {
        void dispatch(refreshActiveRepo());
      }}
    />
  );
}
