import { useEffect } from "react";
import { toast } from "sonner";
import { store } from "@/app/store";
import { desktop } from "@/platform/desktop";
import { gitApi } from "./api";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { repositoryChangeTags, hasRepositoryEventBridge } from "./repositoryFreshness";
import type { RepositoryChange } from "@/platform/desktop/repositoryEvents";

export function RepositoryFreshnessBootstrap() {
  useEffect(() => {
    if (!hasRepositoryEventBridge()) return;
    let disposed = false;
    let subscribed = "";
    let pending: Promise<void> = Promise.resolve();
    const paths = () =>
      [...new Set(store.getState().workspaces.items.map((item) => item.repoPath))].toSorted();
    const refresh = (change: RepositoryChange) => {
      store.dispatch(gitApi.util.invalidateTags(repositoryChangeTags(change)));
      if (change.kinds.includes("config"))
        store.dispatch(
          hostedReposApi.util.invalidateTags([{ type: "HostedRepo", id: change.repoPath }]),
        );
    };
    const synchronize = (force = false) => {
      const repositories = paths();
      const key = JSON.stringify(repositories);
      if (!force && key === subscribed) return;
      subscribed = key;
      pending = pending.then(async () => {
        if (disposed) return;
        const result = await desktop.setRepositorySubscriptions(repositories);
        if (!result.ok)
          toast.error(result.error.message, {
            id: "repository-watch",
            action: { label: "Retry", onClick: () => synchronize(true) },
          });
      });
      if (force)
        for (const repoPath of repositories)
          refresh({
            repoPath,
            kinds: ["worktree", "index", "refs", "config"],
            paths: [],
            structure: true,
          });
    };
    const disposeEvents = desktop.onRepositoryChanged((change) => {
      if (!paths().includes(change.repoPath)) return;
      if (change.failure)
        toast.error("Automatic repository refresh needs attention. " + change.failure.message, {
          id: `repository-watch:${change.repoPath}`,
          action: { label: "Retry", onClick: () => synchronize(true) },
        });
      else {
        toast.dismiss(`repository-watch:${change.repoPath}`);
        refresh(change);
      }
    });
    const unsubscribe = store.subscribe(() => synchronize());
    const recover = () => synchronize(true);
    synchronize(true);
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    return () => {
      disposed = true;
      unsubscribe();
      disposeEvents();
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      void pending.then(() => desktop.setRepositorySubscriptions([]));
    };
  }, []);
  return null;
}
