import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../src/platform/desktop/failure";
import { classifyDesktopFailure } from "./desktop-failure";

const pending = new Map<string, Promise<unknown>>();

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (cause) {
    if (cause instanceof Error && "code" in cause && cause.code === "ENOENT") return null;
    throw cause;
  }
}

function parseStored<T>(raw: string, schema: z.ZodType<T>): T | undefined {
  try {
    const value: unknown = JSON.parse(raw);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  } catch (cause) {
    if (cause instanceof SyntaxError) return undefined;
    throw cause;
  }
}

async function replaceFile(file: string, contents: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    await fs.rename(temporary, file);
    if (process.platform !== "win32") {
      const directory = await fs.open(path.dirname(file), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } finally {
    await handle.close();
    await fs.rm(temporary, { force: true });
  }
}

export function createAtomicJsonStore<T>(options: {
  file: string;
  schema: z.ZodType<T>;
  empty: () => T;
  operation: string;
}) {
  const { file, schema, empty, operation } = options;
  const backup = `${file}.backup`;
  const unreadable = (): DesktopResult<never> => ({
    ok: false,
    error: desktopFailure(
      operation,
      "storage-failed",
      "Saved workspace data could not be read. The original file and backup have been kept. Keep this window open and restore the file before retrying.",
    ),
  });

  async function read(): Promise<DesktopResult<{ data: T; recovered: boolean }>> {
    try {
      await pending.get(file);
      const raw = await readText(file);
      if (raw !== null) {
        const data = parseStored(raw, schema);
        if (data !== undefined) return desktopSuccess({ data, recovered: false });
      }
      const backupRaw = await readText(backup);
      if (backupRaw !== null) {
        const data = parseStored(backupRaw, schema);
        if (data !== undefined) return desktopSuccess({ data, recovered: true });
      }
      return raw === null && backupRaw === null
        ? desktopSuccess({ data: empty(), recovered: false })
        : unreadable();
    } catch (cause) {
      return { ok: false, error: classifyDesktopFailure(cause, operation) };
    }
  }

  function write(value: unknown): Promise<DesktopResult<T>> {
    const input = schema.safeParse(value);
    if (!input.success)
      return Promise.resolve({
        ok: false,
        error: desktopFailure(
          operation,
          "invalid-input",
          "Workspace drafts could not be saved because their data is incomplete. Keep this window open; your previous saved work has been kept.",
        ),
      });
    const work = (pending.get(file) ?? Promise.resolve()).then(
      async (): Promise<DesktopResult<T>> => {
        try {
          const raw = await readText(file);
          if (raw !== null) {
            if (parseStored(raw, schema) !== undefined) await replaceFile(backup, raw);
            else {
              const backupRaw = await readText(backup);
              if (backupRaw === null || parseStored(backupRaw, schema) === undefined)
                return unreadable();
              await replaceFile(`${file}.damaged-${randomUUID()}`, raw);
            }
          }
          await replaceFile(file, JSON.stringify(input.data, null, 2));
          return desktopSuccess(input.data);
        } catch (cause) {
          return { ok: false, error: classifyDesktopFailure(cause, operation) };
        }
      },
    );
    pending.set(file, work);
    void work.finally(() => {
      if (pending.get(file) === work) pending.delete(file);
    });
    return work;
  }

  return { read, write };
}

export async function flushAtomicJsonWrites() {
  await Promise.allSettled(pending.values());
}
