import {
  branchActions,
  remoteActions,
  stashActions,
  tagActions,
  worktreeActions,
} from "./commandComposerModel";
import type { ComposerAction } from "./commandComposerModel";

export type ComposerPane = "action" | "choice" | "review" | "execute";

export function paneAfterAction(action: ComposerAction | null, remoteCount: number): ComposerPane {
  if (!action) return "action";
  if (
    branchActions.has(action) ||
    stashActions.has(action) ||
    tagActions.has(action) ||
    worktreeActions.has(action)
  )
    return "choice";
  if (remoteActions.has(action) && remoteCount !== 1) return "choice";
  return "review";
}

export function previousPane(
  pane: ComposerPane,
  action: ComposerAction | null,
  remoteCount: number,
): ComposerPane {
  if (pane === "execute") return "review";
  if (pane !== "review" || !action) return "action";
  if (
    branchActions.has(action) ||
    stashActions.has(action) ||
    tagActions.has(action) ||
    worktreeActions.has(action)
  )
    return "choice";
  if (remoteActions.has(action) && remoteCount > 1) return "choice";
  return "action";
}
