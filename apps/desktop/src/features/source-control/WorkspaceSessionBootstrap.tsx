import { useEffect, useState, type ReactNode } from "react";

import { store } from "@/app/store";
import { toast } from "sonner";
import { useAppDispatch } from "@/app/hooks";

import { persistWorkspaceSession, restoreWorkspaceSession } from "./actions";

type Props = {
  children: ReactNode;
};

export function WorkspaceSessionBootstrap({ children }: Props) {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void dispatch(restoreWorkspaceSession()).finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [dispatch]);

  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous = store.getState();
    const save = () => {
      clearTimeout(timer);
      void persistWorkspaceSession(store.getState).then((result) => {
        if (!result.ok) {
          toast.error(result.error.message, {
            id: "workspace-save",
            duration: Infinity,
            action: { label: "Retry", onClick: save },
          });
        } else {
          toast.dismiss("workspace-save");
        }
      });
    };
    const unsubscribe = store.subscribe(() => {
      const next = store.getState();
      const changed =
        next.workspaces !== previous.workspaces ||
        next.sourceControl !== previous.sourceControl ||
        next.pullRequests !== previous.pullRequests;
      previous = next;
      if (!changed) return;
      clearTimeout(timer);
      timer = setTimeout(save, 150);
    });
    window.addEventListener("pagehide", save);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      window.removeEventListener("pagehide", save);
    };
  }, [ready]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
