import { useEffect, useState, type ReactNode } from "react";

import { useAppDispatch } from "@/app/hooks";

import { restoreWorkspaceSession } from "./actions";

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

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
