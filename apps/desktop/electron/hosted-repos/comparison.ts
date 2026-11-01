import { gitObjectIdSchema } from "../../src/platform/desktop/gitObjectId";
import {
  desktopFailure,
  desktopSuccess,
  type DesktopResult,
} from "../../src/platform/desktop/failure";
import { classifyDesktopFailure } from "../desktop-failure";
import { GitCommandError, OPEN_WARDEN_REMOTE_PREFIX, runGitInRepo } from "./git";

type CommitSource = Readonly<{ remoteUrl: string; commitSha: string }>;

export type PullRequestComparisonInput = Readonly<{
  repoPath: string;
  pullRequestNumber: number;
  base: CommitSource;
  head: CommitSource;
  authHeaders: readonly string[];
}>;

type PullRequestComparison = Readonly<{
  baseSha: string;
  compareBaseRef: string;
  compareHeadRef: string;
}>;

const operation = "preparePullRequestCompareRefs";

function isGitAuthFailure(error: unknown) {
  if (!(error instanceof GitCommandError)) return false;

  const stderr = error.stderr.toLowerCase();

  return (
    stderr.includes("authentication failed") ||
    stderr.includes("could not read username") ||
    stderr.includes("access denied") ||
    stderr.includes("invalid username or password") ||
    stderr.includes("forbidden")
  );
}

async function fetchCommit(
  repoPath: string,
  source: CommitSource,
  targetRef: string,
  authHeaders: readonly string[],
) {
  for (const [index, authHeader] of authHeaders.entries()) {
    try {
      await runGitInRepo(
        repoPath,
        ["fetch", "--force", "--no-tags", source.remoteUrl, `+${source.commitSha}:${targetRef}`],
        { authHeader },
      );

      return;
    } catch (cause) {
      if (!isGitAuthFailure(cause) || index === authHeaders.length - 1) throw cause;
    }
  }
}

export async function fetchPullRequestComparison(
  input: PullRequestComparisonInput,
): Promise<DesktopResult<PullRequestComparison>> {
  const base = gitObjectIdSchema.safeParse(input.base.commitSha);
  const head = gitObjectIdSchema.safeParse(input.head.commitSha);

  if (!base.success || !head.success) {
    return {
      ok: false,
      error: desktopFailure(
        operation,
        "unavailable",
        "The provider did not supply full PR commit IDs.",
      ),
    };
  }

  if (!input.authHeaders.length) {
    return {
      ok: false,
      error: desktopFailure(
        operation,
        "authentication",
        "Reconnect the Git provider and try again.",
      ),
    };
  }

  const trackingRoot = `refs/remotes/${OPEN_WARDEN_REMOTE_PREFIX}`;
  const results = await Promise.allSettled([
    fetchCommit(
      input.repoPath,
      { ...input.base, commitSha: base.data },
      `${trackingRoot}/base/pr-${input.pullRequestNumber}`,
      input.authHeaders,
    ),
    fetchCommit(
      input.repoPath,
      { ...input.head, commitSha: head.data },
      `${trackingRoot}/head/pr-${input.pullRequestNumber}`,
      input.authHeaders,
    ),
  ]);

  for (const result of results) {
    if (result.status === "rejected") {
      return { ok: false, error: classifyDesktopFailure(result.reason, operation) };
    }
  }

  try {
    // Tracking refs can be replaced by another read; this comparison stays bound to its snapshot.
    const output = await runGitInRepo(input.repoPath, ["merge-base", base.data, head.data]);
    const mergeBase = gitObjectIdSchema.safeParse(output.toString("utf8").trim());

    if (!mergeBase.success) {
      return {
        ok: false,
        error: desktopFailure(operation, "unexpected", "Git returned an invalid PR merge base."),
      };
    }

    return desktopSuccess({
      baseSha: base.data,
      compareBaseRef: mergeBase.data,
      compareHeadRef: head.data,
    });
  } catch (cause) {
    return { ok: false, error: classifyDesktopFailure(cause, operation) };
  }
}
