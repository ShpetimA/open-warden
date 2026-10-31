import { store } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { gitApi } from "@/features/source-control/api";
import { commitFileGroupsApi } from "../commitFileGroupsApi";
import {
  failureFromUnknown,
  readDesktopFailure,
  type DesktopFailure,
} from "@/platform/desktop/failure";
import type { PullRequestLocatorInput } from "@/platform/desktop";
import type { PullRequestRefreshResource } from "./PullRequestRefreshController";

const READ_CONCURRENCY = 3;

export async function refreshPullRequest(
  locator: PullRequestLocatorInput,
  manual: boolean,
  resources: readonly PullRequestRefreshResource[],
  appStore: Pick<typeof store, "dispatch" | "getState"> = store,
): Promise<DesktopFailure[]> {
  const api = hostedReposApi.endpoints;
  const stateBefore = appStore.getState();
  const before = api.getPullRequestConversation.select(locator)(stateBefore);
  const cachedFailures = [
    before,
    ...(resources.includes("checks")
      ? [api.getPullRequestChecks.select(locator)(stateBefore)]
      : []),
    ...(resources.includes("reviewers")
      ? [api.getPullRequestReviewOverview.select(locator)(stateBefore)]
      : []),
    ...(resources.includes("files") ? [api.getPullRequestFiles.select(locator)(stateBefore)] : []),
    ...(resources.includes("activity")
      ? [api.getPullRequestActivity.select(locator)(stateBefore)]
      : []),
    ...(resources.includes("viewed")
      ? [api.getPullRequestViewedFiles.select(locator)(stateBefore)]
      : []),
    ...(resources.includes("extras")
      ? [api.getPullRequestExtras.select(locator)(stateBefore)]
      : []),
    ...(resources.includes("comparison")
      ? [api.preparePullRequestCompareRefs.select(locator)(stateBefore)]
      : []),
  ].flatMap((query) => {
    const failure = readDesktopFailure(query.error);
    return failure ? [failure] : [];
  });
  const blocked = cachedFailures.filter((failure) => (failure.retryAt ?? 0) > Date.now());
  if (blocked.length) return blocked;
  const permanent = cachedFailures.filter((failure) =>
    ["authentication", "permission", "not-found", "invalid-input"].includes(failure.code),
  );
  if (!manual && permanent.length) return permanent;
  const conversation = await appStore.dispatch(
    api.getPullRequestConversation.initiate(locator, { subscribe: false, forceRefetch: true }),
  );
  if (conversation.error) {
    const failure = readDesktopFailure(conversation.error);
    return [failure ?? failureFromUnknown(conversation.error, "refreshPullRequest")];
  }
  const detail = conversation.data?.detail;
  const changed =
    detail &&
    (detail.headSha !== before.data?.detail.headSha ||
      detail.baseSha !== before.data?.detail.baseSha);
  if (detail) {
    for (const input of hostedReposApi.util.selectCachedArgsForQuery(
      appStore.getState(),
      "listPullRequests",
    )) {
      if (input.repoPath !== locator.repoPath) continue;
      appStore.dispatch(
        hostedReposApi.util.updateQueryData("listPullRequests", input, (page) => {
          const summary = page.pullRequests.find(
            (item) => item.number === locator.pullRequestNumber,
          );
          if (!summary) return;
          summary.title = detail.title;
          summary.state = detail.state;
          summary.isDraft = detail.isDraft;
          summary.baseRef = detail.baseRef;
          summary.headRef = detail.headRef;
          summary.updatedAt = detail.updatedAt;
          if (changed) {
            summary.checksState = null;
            summary.additions = null;
            summary.deletions = null;
            summary.changedFiles = null;
          }
        }),
      );
    }
  }
  const reads: Array<() => Promise<{ error?: unknown }>> = [];
  const options = { subscribe: false, forceRefetch: true };
  if (resources.includes("checks"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestChecks.initiate(locator, options)),
    );
  if (resources.includes("reviewers"))
    reads.push(
      async () =>
        await appStore.dispatch(api.getPullRequestReviewOverview.initiate(locator, options)),
    );
  if (resources.includes("files"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestFiles.initiate(locator, options)),
    );
  if (resources.includes("activity"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestActivity.initiate(locator, options)),
    );
  if (resources.includes("viewed"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestViewedFiles.initiate(locator, options)),
    );
  if (resources.includes("extras"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestExtras.initiate(locator, options)),
    );
  const cachedComparison = api.preparePullRequestCompareRefs.select(locator)(stateBefore);
  const comparisonMatches = Boolean(
    detail &&
    cachedComparison.data?.compareHeadRef.startsWith(detail.headSha) &&
    cachedComparison.data.baseSha.startsWith(detail.baseSha),
  );
  if (
    resources.includes("comparison") &&
    (manual || changed || cachedComparison.error || !comparisonMatches)
  )
    reads.push(
      async () =>
        await appStore.dispatch(api.preparePullRequestCompareRefs.initiate(locator, options)),
    );
  const failures: DesktopFailure[] = [];
  for (let offset = 0; offset < reads.length; offset += READ_CONCURRENCY) {
    const results = await Promise.all(
      reads.slice(offset, offset + READ_CONCURRENCY).map((read) => read()),
    );
    for (const result of results) {
      const failure = readDesktopFailure(result.error);
      if (result.error)
        failures.push(failure ?? failureFromUnknown(result.error, "refreshPullRequest"));
    }
    if (
      failures.some((failure) =>
        ["authentication", "permission", "rate-limit"].includes(failure.code),
      )
    )
      break;
  }

  const refs = api.preparePullRequestCompareRefs.select(locator)(appStore.getState()).data;
  if (
    resources.includes("comparison") &&
    refs &&
    detail &&
    refs.compareHeadRef.startsWith(detail.headSha) &&
    refs.baseSha.startsWith(detail.baseSha)
  ) {
    const input = {
      repoPath: locator.repoPath,
      baseRef: refs.compareBaseRef,
      headRef: refs.compareHeadRef,
    };
    const state = appStore.getState();
    const comparisonReads: Array<() => Promise<{ error?: unknown }>> = [];
    if (resources.includes("comparison-files"))
      comparisonReads.push(async () =>
        appStore.dispatch(
          gitApi.endpoints.getBranchFiles.initiate(input, {
            subscribe: false,
            forceRefetch: Boolean(gitApi.endpoints.getBranchFiles.select(input)(state).error),
          }),
        ),
      );
    if (resources.includes("commits"))
      comparisonReads.push(async () =>
        appStore.dispatch(
          gitApi.endpoints.getBranchCommits.initiate(input, {
            subscribe: false,
            forceRefetch: Boolean(gitApi.endpoints.getBranchCommits.select(input)(state).error),
          }),
        ),
      );
    if (resources.includes("commit-groups"))
      comparisonReads.push(async () =>
        appStore.dispatch(
          commitFileGroupsApi.endpoints.getCommitFileGroups.initiate(input, {
            subscribe: false,
            forceRefetch: Boolean(
              commitFileGroupsApi.endpoints.getCommitFileGroups.select(input)(state).error,
            ),
          }),
        ),
      );
    for (const resource of resources) {
      if (!resource.startsWith("commit-files:")) continue;
      const commitId = resource.slice("commit-files:".length);
      const commitInput = {
        repoPath: locator.repoPath,
        baseRef: `${commitId}^`,
        headRef: commitId,
      };
      if (gitApi.endpoints.getBranchFiles.select(commitInput)(state).error)
        comparisonReads.push(async () =>
          appStore.dispatch(gitApi.endpoints.getBranchFiles.initiate(commitInput, options)),
        );
    }
    const results = await Promise.all(comparisonReads.map((read) => read()));
    for (const result of results) {
      if (!result.error) continue;
      failures.push(
        readDesktopFailure(result.error) ?? failureFromUnknown(result.error, "refreshPullRequest"),
      );
    }
  }

  appStore.dispatch(
    hostedReposApi.util.invalidateTags([{ type: "PullRequests", id: locator.repoPath }]),
  );
  return failures;
}
