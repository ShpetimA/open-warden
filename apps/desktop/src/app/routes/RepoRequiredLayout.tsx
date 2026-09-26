import { Outlet, useOutletContext } from "react-router";

import type { AppShellOutletContext } from "@/app/AppShell";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { openRepo } from "@/features/source-control/actions";
import { EmptyRepoState } from "@/features/source-control/components/EmptyRepoState";

export function RepoRequiredLayout() {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);
  const { openRepositoryComposer } = useOutletContext<AppShellOutletContext>();

  if (!activeRepo) {
    return (
      <EmptyRepoState
        recentRepos={recentRepos}
        onOpenPicker={openRepositoryComposer}
        onOpenRepo={(repo) => {
          void dispatch(openRepo(repo));
        }}
      />
    );
  }

  return <Outlet />;
}
