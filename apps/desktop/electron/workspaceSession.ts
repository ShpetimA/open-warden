import { promises as fs } from "node:fs";
import path from "node:path";

import { app } from "electron";

import type { WorkspaceSession } from "../src/platform/desktop/contracts";
import { createWorkspaceSession } from "../src/platform/desktop/workspaceSession";

const WORKSPACE_SESSION_FILE_NAME = "workspace-session.json";

function resolveWorkspaceSessionPath() {
  return path.join(app.getPath("userData"), WORKSPACE_SESSION_FILE_NAME);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export async function loadWorkspaceSession(): Promise<WorkspaceSession> {
  try {
    const rawSession = await fs.readFile(resolveWorkspaceSessionPath(), "utf8");
    return createWorkspaceSession(JSON.parse(rawSession));
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return createWorkspaceSession();
    }

    throw error;
  }
}

export async function saveWorkspaceSession(session: WorkspaceSession): Promise<WorkspaceSession> {
  const normalizedSession = createWorkspaceSession(session);
  const sessionPath = resolveWorkspaceSessionPath();

  await fs.mkdir(path.dirname(sessionPath), { recursive: true });
  await fs.writeFile(sessionPath, JSON.stringify(normalizedSession, null, 2), "utf8");

  return normalizedSession;
}
