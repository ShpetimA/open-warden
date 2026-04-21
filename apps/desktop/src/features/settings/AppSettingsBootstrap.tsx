import { useEffect, useState, type ReactNode } from "react";

import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";

import { restoreAppSettings } from "./actions";
import { hydrateAppSettings } from "./settingsSlice";

type Props = {
  children: ReactNode;
};

export function AppSettingsBootstrap({ children }: Props) {
  const dispatch = useAppDispatch();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = desktop.onAppSettingsChanged((settings) => {
      dispatch(hydrateAppSettings(settings));
    });

    void dispatch(restoreAppSettings()).finally(() => {
      if (!cancelled) {
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [dispatch]);

  if (!ready) {
    return null;
  }

  return <>{children}</>;
}
