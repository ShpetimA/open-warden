import { createContext, useContext, type ReactNode } from "react";

import type { ComposerAction } from "./commandComposerModel";
import type { PullRequestSummary } from "@/platform/desktop/contracts";

type OpenComposer = (action?: ComposerAction, pullRequest?: PullRequestSummary) => void;

const CommandComposerLauncherContext = createContext<OpenComposer | null>(null);

export function CommandComposerLauncherProvider({
  children,
  open,
}: {
  children: ReactNode;
  open: OpenComposer;
}) {
  return (
    <CommandComposerLauncherContext.Provider value={open}>
      {children}
    </CommandComposerLauncherContext.Provider>
  );
}

export function useCommandComposerLauncher(): OpenComposer {
  const open = useContext(CommandComposerLauncherContext);
  if (!open) throw new Error("Command composer launcher is unavailable.");
  return open;
}
