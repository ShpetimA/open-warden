import { useEffect } from "react";

import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";

import { lspDiagnosticsReceived } from "./lspSlice";

export function LspDiagnosticsBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    const unsubscribe = desktop.onLspDiagnostics((event) => {
      dispatch(lspDiagnosticsReceived(event));
    });

    return unsubscribe;
  }, [dispatch]);

  return null;
}
