import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

import { desktopFailure, type DesktopResult } from "../src/platform/desktop/failure";
import { classifyDesktopFailure } from "./desktop-failure";

const execute = promisify(execFile);
const running = new Set<string>();

export async function coordinateRepositoryWrite<T>(
  repoPath: string,
  operation: string,
  run: () => Promise<DesktopResult<T>>,
): Promise<DesktopResult<T>> {
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
  }
}
