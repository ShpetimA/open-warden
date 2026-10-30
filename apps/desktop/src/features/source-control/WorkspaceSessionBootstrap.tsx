import { useEffect, useState, type ReactNode } from "react";

import { ErrorState } from "@/components/ui/error-state";
import type { DesktopFailure } from "@/platform/desktop/failure";
import { desktop } from "@/platform/desktop";
import { store } from "@/app/store";
import { useAppDispatch } from "@/app/hooks";

import { persistWorkspaceSession, restoreWorkspaceSession } from "./actions";

type Props = {
  children: ReactNode;
};

export function WorkspaceSessionBootstrap({ children }: Props) {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<DesktopFailure | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void dispatch(restoreWorkspaceSession()).then((result) => {
      if (cancelled) return;
      if (result.ok) setReady(true);
      else setRestoreError(result.error);
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch, attempt]);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = store.getState();
    const save = async (): Promise<boolean> => {
      clearTimeout(timer);
      const result = await persistWorkspaceSession(store.getState);
      return result.ok;
    };
    const disposeClose = desktop.onWorkspaceFlushRequested?.(save);
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      const changed =
        next.workspaces !== previous.workspaces ||
        next.sourceControl !== previous.sourceControl ||
        next.pullRequests !== previous.pullRequests ||
        next.comments !== previous.comments;
      const draftsChanged =
        next.comments !== previous.comments ||
        next.sourceControl.commitMessage !== previous.sourceControl.commitMessage;
      previous = next;
      if (!changed) return;
      clearTimeout(timer);
      if (draftsChanged) void save();
      else
        timer = setTimeout(() => {
          void save();
        }, 150);
    });
    const saveOnPageHide = () => {
      void save();
    };
    window.addEventListener("pagehide", saveOnPageHide);
    return () => {
      disposeClose?.();
      unsubscribe();
      clearTimeout(timer);
      window.removeEventListener("pagehide", saveOnPageHide);
    };
  }, [ready]);

  if (restoreError) {
    return (
      <div className="h-screen bg-background p-6">
        <ErrorState
          title="Couldn’t restore your workspace"
          error={restoreError}
          recovery={{
            label: "Retry",
            onAction: () => {
              setRestoreError(null);
              setAttempt((value) => value + 1);
            },
          }}
        />
      </div>
    );
  }
  if (!ready) return null;

  return <>{children}</>;
}
