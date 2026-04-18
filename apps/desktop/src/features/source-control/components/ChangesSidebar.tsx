import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import { refreshActiveRepo } from "@/features/source-control/actions";
import CurrentRepositoryHeader from "@/features/source-control/components/CurrentRepoHeader";
import { ChangesTab } from "@/features/source-control/components/ChangesTab";

export function ChangesSidebar() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction);
  const { activeBranch } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      activeBranch: data?.branch ?? "",
    }),
  });

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 overflow-hidden overflow-x-hidden border-r">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <CurrentRepositoryHeader
          activeRepo={activeRepo}
          activeBranch={activeBranch}
          runningAction={runningAction}
          onRefresh={() => {
            void dispatch(refreshActiveRepo());
          }}
        />

        <ChangesTab />
      </div>
    </aside>
  );
}
