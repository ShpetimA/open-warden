import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  guidanceDocumentSchema,
  guidanceFailure,
  type GuidanceDocument,
  type GuidanceLocator,
  type GuidanceResult,
} from "../../src/platform/desktop/guidance";

export class GuidanceStore {
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly directory: string) {}

  private filename(locator: GuidanceLocator) {
    const key = createHash("sha256")
      .update(JSON.stringify([locator.repoPath, locator.pullRequestNumber]))
      .digest("hex");
    return path.join(this.directory, `${key}.json`);
  }

  async read(locator: GuidanceLocator): Promise<GuidanceResult<GuidanceDocument | null>> {
    try {
      const parsed = guidanceDocumentSchema.safeParse(
        JSON.parse(await fs.readFile(this.filename(locator), "utf8")),
      );
      if (!parsed.success)
        return guidanceFailure("storage", "The saved walkthrough could not be read.");
      if (
        parsed.data.repoPath !== locator.repoPath ||
        parsed.data.pullRequestNumber !== locator.pullRequestNumber
      ) {
        return guidanceFailure("storage", "The saved walkthrough belongs to another pull request.");
      }
      return { ok: true, value: parsed.data };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return { ok: true, value: null };
      return guidanceFailure("storage", "The saved walkthrough could not be read.");
    }
  }

  async list(): Promise<GuidanceResult<GuidanceDocument[]>> {
    try {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const documents: GuidanceDocument[] = [];
      for (const filename of await fs.readdir(this.directory)) {
        if (!filename.endsWith(".json")) continue;
        const parsed = guidanceDocumentSchema.safeParse(
          JSON.parse(await fs.readFile(path.join(this.directory, filename), "utf8")),
        );
        if (!parsed.success)
          return guidanceFailure("storage", "A saved walkthrough could not be read.");
        documents.push(parsed.data);
      }
      return { ok: true, value: documents };
    } catch {
      return guidanceFailure("storage", "Saved walkthroughs could not be read.");
    }
  }

  async update(
    locator: GuidanceLocator,
    change: (current: GuidanceDocument | null) => GuidanceResult<GuidanceDocument>,
  ): Promise<GuidanceResult<GuidanceDocument>> {
    const operation = this.pending.then(async (): Promise<GuidanceResult<GuidanceDocument>> => {
      const current = await this.read(locator);
      if (!current.ok) return current;
      const next = change(current.value);
      if (!next.ok) return next;
      const parsed = guidanceDocumentSchema.safeParse(next.value);
      if (!parsed.success) return guidanceFailure("invalid-input", "The walkthrough is invalid.");
      const temporary = `${this.filename(locator)}.${randomUUID()}.tmp`;
      try {
        await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(temporary, JSON.stringify(parsed.data), { mode: 0o600 });
        await fs.rename(temporary, this.filename(locator));
        return { ok: true, value: parsed.data };
      } catch {
        return guidanceFailure("storage", "The walkthrough could not be saved.");
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => {});
      }
    });
    this.pending = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
}
