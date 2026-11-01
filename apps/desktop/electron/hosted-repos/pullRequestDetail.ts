import { z } from "zod";

import type {
  PullRequestDetail,
  PullRequestDetailInput,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketAuthorizationValue,
  fetchBitbucketPullRequest,
  toBitbucketPullRequestDetail,
} from "../bitbucket-repo";
import { fetchGitHubPullRequest, toPullRequestDetail } from "../github-repo";
import { DesktopAdapterError } from "../desktop-failure";
import { desktopFailure } from "../../src/platform/desktop/failure";
import { providerRequests } from "../providerTransport";
import { resolvePullRequestContext } from "./pullRequests";

const refreshInput = z.strictObject({
  repoPath: z.string().min(1),
  pullRequestNumber: z.number().int().positive(),
  mode: z.enum(["read", "refresh", "poll"]),
});

export async function getPullRequestDetail(
  input: PullRequestDetailInput,
): Promise<PullRequestDetail> {
  const parsed = refreshInput.safeParse(input);
  if (!parsed.success)
    throw new DesktopAdapterError(
      desktopFailure(
        "getPullRequestDetail",
        "invalid-input",
        "Select a valid pull request to refresh.",
      ),
    );

  const locator = parsed.data;
  const { hostedRepo, connection } = await resolvePullRequestContext(locator);
  const options = {
    maxAgeMs: locator.mode === "read" ? 2000 : 0,
    priority: locator.mode === "poll" ? ("background" as const) : ("interactive" as const),
  };

  if (hostedRepo.providerId === "github") {
    if (locator.mode === "refresh")
      providerRequests.revalidate("github", `Bearer ${connection.token}`);
    const response = await fetchGitHubPullRequest(
      hostedRepo,
      connection.token,
      locator.pullRequestNumber,
      options,
    );
    return toPullRequestDetail(response, "github");
  }

  if (hostedRepo.providerId === "bitbucket") {
    if (locator.mode === "refresh")
      providerRequests.revalidate("bitbucket", bitbucketAuthorizationValue(connection));
    const response = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      locator.pullRequestNumber,
      options,
    );
    return toBitbucketPullRequestDetail(response, hostedRepo);
  }

  throw new DesktopAdapterError(
    desktopFailure(
      "getPullRequestDetail",
      "unavailable",
      "This provider does not support pull request refresh.",
    ),
  );
}
