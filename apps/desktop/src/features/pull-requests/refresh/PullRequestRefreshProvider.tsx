import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { store } from "@/app/store";
import { hostedReposApi } from "@/features/hosted-repos/api";
import {
  failureFromUnknown,
  readDesktopFailure,
  type DesktopFailure,
} from "@/platform/desktop/failure";
import type { PullRequestLocatorInput } from "@/platform/desktop";
import { IDLE_REFRESH, PullRequestRefreshController } from "./PullRequestRefreshController";

const RefreshContext = createContext<PullRequestRefreshController | null>(null);
const READ_CONCURRENCY = 3;

async function refreshPullRequest(
  locator: PullRequestLocatorInput,
  manual: boolean,
): Promise<DesktopFailure[]> {
  const api = hostedReposApi.endpoints;
  const stateBefore = store.getState();
  const before = api.getPullRequestConversation.select(locator)(stateBefore);
  const cachedFailures = [
    before,
    api.getPullRequestChecks.select(locator)(stateBefore),
    api.getPullRequestReviewOverview.select(locator)(stateBefore),
    api.getPullRequestFiles.select(locator)(stateBefore),
    api.getPullRequestActivity.select(locator)(stateBefore),
    api.getPullRequestViewedFiles.select(locator)(stateBefore),
    api.getPullRequestExtras.select(locator)(stateBefore),
    api.preparePullRequestCompareRefs.select(locator)(stateBefore),
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
  const conversation = await store.dispatch(
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
  const reads: Array<() => Promise<{ error?: unknown }>> = [];
  const options = { subscribe: false, forceRefetch: true };
  const state = store.getState();
  if (!api.getPullRequestChecks.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestChecks.initiate(locator, options)),
    );
  if (!api.getPullRequestReviewOverview.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestReviewOverview.initiate(locator, options)),
    );
  if (!api.getPullRequestFiles.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestFiles.initiate(locator, options)),
    );
  if (!api.getPullRequestActivity.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestActivity.initiate(locator, options)),
    );
  if (!api.getPullRequestViewedFiles.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestViewedFiles.initiate(locator, options)),
    );
  if (!api.getPullRequestExtras.select(locator)(state).isUninitialized)
    reads.push(
      async () => await store.dispatch(api.getPullRequestExtras.initiate(locator, options)),
    );
  if (
    (manual || changed) &&
    !api.preparePullRequestCompareRefs.select(locator)(state).isUninitialized
  )
    reads.push(
      async () =>
        await store.dispatch(api.preparePullRequestCompareRefs.initiate(locator, options)),
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
  return failures;
}

export function PullRequestRefreshProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(
    () =>
      new PullRequestRefreshController({
        now: Date.now,
        schedule(work, delay) {
          const timer = window.setTimeout(work, delay);
          return () => window.clearTimeout(timer);
        },
        refresh: refreshPullRequest,
      }),
  );
  useEffect(() => {
    const recover = () => controller.recover();
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    return () => {
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      controller.dispose();
    };
  }, [controller]);
  return <RefreshContext.Provider value={controller}>{children}</RefreshContext.Provider>;
}

export function useRetainPullRequestRefresh(locator: PullRequestLocatorInput | null) {
  const controller = useContext(RefreshContext);
  const repoPath = locator?.repoPath;
  const number = locator?.pullRequestNumber;

  useEffect(() => {
    if (controller && repoPath && number)
      return controller.retain({ repoPath, pullRequestNumber: number });
  }, [controller, repoPath, number]);
}

export function usePullRequestRefresh(locator: PullRequestLocatorInput | null) {
  const controller = useContext(RefreshContext);
  useRetainPullRequestRefresh(locator);
  const state = useSyncExternalStore(
    (listener) => (controller && locator ? controller.subscribe(locator, listener) : () => {}),
    () => (controller && locator ? controller.state(locator) : IDLE_REFRESH),
  );
  return {
    ...state,
    refresh: () => (locator && controller ? controller.request(locator) : Promise.resolve()),
  };
}
