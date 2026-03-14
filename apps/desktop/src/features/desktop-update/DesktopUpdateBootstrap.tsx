import { useEffect } from "react";

import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";

import { desktopUpdateStateReceived } from "./desktopUpdateSlice";

export function DesktopUpdateBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    let active = true;

    const applyState = (state: Parameters<typeof desktopUpdateStateReceived>[0]) => {
      if (!active) {
        return;
      }

      dispatch(desktopUpdateStateReceived(state));
    };

    void desktop.getUpdateState().then(applyState).catch(() => {});

    const unsubscribe = desktop.onUpdateState((state) => {
      applyState(state);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [dispatch]);

  return null;
}
