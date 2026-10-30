import path from "node:path";
import { app } from "electron";

import type { WorkspaceSession } from "../src/platform/desktop/contracts";
import {
  createWorkspaceSession,
  storedWorkspaceSessionSchema,
} from "../src/platform/desktop/workspaceSession";
import { desktopSuccess, type DesktopResult } from "../src/platform/desktop/failure";
import { createAtomicJsonStore } from "./atomicJsonStore";

function sessionStore() {
  return createAtomicJsonStore({
    file: path.join(app.getPath("userData"), "workspace-session.json"),
    schema: storedWorkspaceSessionSchema,
    empty: createWorkspaceSession,
    operation: "workspaceSession",
  });
}

export async function loadWorkspaceSession(): Promise<DesktopResult<WorkspaceSession>> {
  const result = await sessionStore().read();
  if (!result.ok) return result;
  return desktopSuccess({
    ...createWorkspaceSession(result.value.data),
    ...(result.value.recovered
      ? {
          recoveryNotice:
            "Workspace drafts were recovered from the last valid backup. The damaged file has been kept.",
        }
      : {}),
  });
}

export async function saveWorkspaceSession(
  session: WorkspaceSession,
): Promise<DesktopResult<WorkspaceSession>> {
  const parsed = storedWorkspaceSessionSchema.safeParse(session);
  return sessionStore().write(parsed.success ? createWorkspaceSession(parsed.data) : session);
}
