import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { desktopFailure, type DesktopResult } from "../src/platform/desktop/failure";
import type { RepositoryWriteEvent } from "./repositoryChangeDefinitions";
import { classifyDesktopFailure } from "./desktop-failure";

const execute = promisify(execFile);
const running = new Set<string>();
type WriteNotice = RepositoryWriteEvent & {
  repoPath: string;
  commonDir: string;
};
const listeners = new Set<(notice: WriteNotice) => void>();

export function subscribeRepositoryWrites(listener: (notice: WriteNotice) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function coordinateRepositoryWrite<T>(
  repoPath: string,
  event: RepositoryWriteEvent,
  run: () => Promise<DesktopResult<T>>,
): Promise<DesktopResult<T>> {
  const { operation, impact } = event;
  let key: string | undefined;
  try {
    const { stdout } = await execute(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: repoPath, timeout: 30_000 },
    );
    key = await realpath(stdout.trim());
    if (running.has(key)) {
      return {
        ok: false,
        error: desktopFailure(
          operation,
          "busy",
          "Another Git operation is running for this repository. Wait, then try again.",
        ),
      };
    }
    running.add(key);
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  }

  try {
    return await run();
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  } finally {
    running.delete(key);
    for (const listener of listeners) listener({ repoPath, commonDir: key, operation, impact });
  }
}
