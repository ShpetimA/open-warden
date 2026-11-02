import { z } from "zod";

import { gitObjectIdSchema } from "../src/platform/desktop/gitObjectId";
import { desktopFailure, type DesktopResult } from "../src/platform/desktop/failure";
import { classifyDesktopFailure } from "./desktop-failure";

type CommitInput = Readonly<{
  owner: string;
  repo: string;
  reference: unknown;
}>;

export type BitbucketReadOptions = Readonly<{
  maxAgeMs?: number;
  priority?: "interactive" | "background";
}>;

type ReadJson = (pathname: string, options: BitbucketReadOptions) => Promise<unknown>;

const abbreviatedId = z
  .string()
  .min(4)
  .max(63)
  .regex(/^[0-9a-f]+$/);
const commitResponse = z.object({ hash: gitObjectIdSchema });
const operation = "bitbucket.resolveCommit";

export class BitbucketCommitResolver {
  constructor(private readonly readJson: ReadJson) {}

  async resolve(
    input: CommitInput,
    options: BitbucketReadOptions = {},
  ): Promise<DesktopResult<string>> {
    const full = gitObjectIdSchema.safeParse(input.reference);
    if (full.success) return { ok: true, value: full.data };

    const abbreviated = abbreviatedId.safeParse(input.reference);
    if (!abbreviated.success) {
      return {
        ok: false,
        error: desktopFailure(
          operation,
          "unavailable",
          "Bitbucket did not supply a valid PR commit ID.",
        ),
      };
    }

    const repositoryPath = `/repositories/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`;
    const pathname = `${repositoryPath}/commit/${abbreviated.data}?fields=hash`;

    try {
      const payload = await this.readJson(pathname, options);
      const resolved = commitResponse.safeParse(payload);

      if (!resolved.success || !resolved.data.hash.startsWith(abbreviated.data)) {
        return {
          ok: false,
          error: desktopFailure(
            operation,
            "unavailable",
            "Bitbucket could not resolve this PR commit to a matching full ID. Refresh and try again.",
          ),
        };
      }

      return { ok: true, value: resolved.data.hash };
    } catch (cause) {
      return { ok: false, error: classifyDesktopFailure(cause, operation) };
    }
  }
}
