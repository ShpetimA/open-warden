import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { z } from "zod";
import type { DirectoryListing } from "../src/platform/desktop/contracts";

export async function browseDirectory(input: string): Promise<DirectoryListing> {
  const requested = z.string().min(1).parse(input);
  const expanded =
    requested === "~"
      ? homedir()
      : requested.startsWith("~/")
        ? path.join(homedir(), requested.slice(2))
        : requested;
  if (!path.isAbsolute(expanded))
    return { ok: false, message: "Enter an absolute path or start with ~/" };
  const directory = path.resolve(expanded);
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const folders = await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        const isDirectory =
          entry.isDirectory() ||
          (entry.isSymbolicLink() &&
            (await stat(entryPath).then(
              (info) => info.isDirectory(),
              () => false,
            )));
        return isDirectory ? { name: entry.name, path: entryPath } : null;
      }),
    );
    return {
      ok: true,
      path: directory,
      parentPath: path.dirname(directory),
      entries: folders
        .filter((entry) => entry !== null)
        .toSorted((a, b) => a.name.localeCompare(b.name)),
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not read this directory.",
    };
  }
}
