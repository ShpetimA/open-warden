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

export function pullRequestPollInterval(locator: PullRequestLocatorInput): number {
  const detail = hostedReposApi.endpoints.getPullRequestDetail.select(locator)(
    store.getState(),
  ).data;
  return detail && detail.state !== "open" ? 5 * 60_000 : 60_000;
}

export async function refreshPullRequest(
  locator: PullRequestLocatorInput,
  manual: boolean,
  resources: readonly PullRequestRefreshResource[],
  appStore: Pick<typeof store, "dispatch" | "getState"> = store,
): Promise<DesktopFailure[]> {
  const api = hostedReposApi.endpoints;
  await Promise.all([
    appStore.dispatch(hostedReposApi.util.getRunningQueryThunk("getPullRequestDetail", locator)),
    ...(resources.includes("conversation")
      ? [
          appStore.dispatch(
            hostedReposApi.util.getRunningQueryThunk("getPullRequestConversation", locator),
          ),
        ]
      : []),
  ]);

  const stateBefore = appStore.getState();
  const before = api.getPullRequestDetail.select(locator)(stateBefore);
  const previousDetail =
    before.data ?? api.getPullRequestConversation.select(locator)(stateBefore).data?.detail;
  const cachedFailures = [
    before,
    ...(resources.includes("conversation")
      ? [api.getPullRequestConversation.select(locator)(stateBefore)]
      : []),
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
  const refresh = appStore.dispatch(api.refreshPullRequestDetail.initiate({ ...locator, manual }));
  const refreshed = await refresh;
  refresh.reset();

  if (refreshed.error || !refreshed.data) {
    return [
      readDesktopFailure(refreshed.error) ??
        failureFromUnknown(refreshed.error, "refreshPullRequest"),
    ];
  }

  const detail = refreshed.data;
  appStore.dispatch(
    hostedReposApi.util.upsertQueryEntries([
      { endpointName: "getPullRequestDetail", arg: locator, value: detail },
    ]),
  );
  const changed =
    detail.headSha !== previousDetail?.headSha || detail.baseSha !== previousDetail?.baseSha;
  let changedLists = false;

  for (const input of hostedReposApi.util.selectCachedArgsForQuery(
    appStore.getState(),
    "listPullRequests",
  )) {
    if (input.repoPath !== locator.repoPath) continue;
    appStore.dispatch(
      hostedReposApi.util.updateQueryData("listPullRequests", input, (page) => {
        const summary = page.pullRequests.find((item) => item.number === locator.pullRequestNumber);
        if (!summary) return;
        if (
          summary.title !== detail.title ||
          summary.state !== detail.state ||
          summary.updatedAt !== detail.updatedAt
        )
          changedLists = true;
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

  if (changedLists)
    appStore.dispatch(
      hostedReposApi.util.invalidateTags([{ type: "PullRequests", id: locator.repoPath }]),
    );
  const reads: Array<() => Promise<{ error?: unknown }>> = [];
  const options = { subscribe: false, forceRefetch: true };
  if (resources.includes("conversation")) {
    reads.push(
      async () =>
        await appStore.dispatch(api.getPullRequestConversation.initiate(locator, options)),
    );
  } else {
    appStore.dispatch(
      hostedReposApi.util.invalidateTags([
        { type: "PullRequestConversation", id: `${locator.repoPath}:${locator.pullRequestNumber}` },
      ]),
    );
  }
  if (resources.includes("checks"))
    reads.push(
      async () => await appStore.dispatch(api.getPullRequestChecks.initiate(locator, options)),
    );
  if (resources.includes("reviewers"))
    reads.push(
      async () =>
        await appStore.dispatch(api.getPullRequestReviewOverview.initiate(locator, options)),
    );
  const files = api.getPullRequestFiles.select(locator)(stateBefore);
  if (
    resources.includes("files") &&
    (manual ||
      changed ||
      files.error ||
      files.data?.headSha !== detail.headSha ||
      files.data?.baseSha !== detail.baseSha)
  )
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
  const extras = api.getPullRequestExtras.select(locator)(stateBefore);
  if (
    resources.includes("extras") &&
    (manual ||
      changed ||
      extras.error ||
      !extras.fulfilledTimeStamp ||
      Date.now() - extras.fulfilledTimeStamp >= 5 * 60_000)
  )
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

  return failures;
}
