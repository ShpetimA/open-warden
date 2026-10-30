import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { PullRequestLocatorInput } from "@/platform/desktop";
import {
  IDLE_REFRESH,
  PullRequestRefreshController,
  type PullRequestRefreshResource,
  type RefreshRuntime,
} from "./PullRequestRefreshController";

const RefreshContext = createContext<PullRequestRefreshController | null>(null);

export function PullRequestRefreshProvider({
  children,
  refresh,
}: {
  children: ReactNode;
  refresh: RefreshRuntime["refresh"];
}) {
  const [controller] = useState(
    () =>
      new PullRequestRefreshController({
        now: Date.now,
        schedule(work, delay) {
          const timer = window.setTimeout(work, delay);
          return () => window.clearTimeout(timer);
        },
        refresh,
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

const NO_RESOURCES: readonly PullRequestRefreshResource[] = [];

export function useRetainPullRequestRefresh(
  locator: PullRequestLocatorInput | null,
  resources: readonly PullRequestRefreshResource[] = NO_RESOURCES,
) {
  const controller = useContext(RefreshContext);
  const repoPath = locator?.repoPath;
  const number = locator?.pullRequestNumber;

  useEffect(() => {
    if (controller && repoPath && number)
      return controller.retain({ repoPath, pullRequestNumber: number }, resources);
  }, [controller, repoPath, number, resources]);
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

export function useRetainPullRequestCommitRefresh(
  locator: PullRequestLocatorInput | null,
  commitId: string | undefined,
) {
  const controller = useContext(RefreshContext);
  const repoPath = locator?.repoPath;
  const number = locator?.pullRequestNumber;
  useEffect(() => {
    if (controller && repoPath && number && commitId)
      return controller.retain({ repoPath, pullRequestNumber: number }, [
        `commit-files:${commitId}`,
      ]);
  }, [controller, repoPath, number, commitId]);
}

export function useReportPullRequestRevision(
  locator: PullRequestLocatorInput | null,
  pending: boolean,
) {
  const controller = useContext(RefreshContext);
  const owner = useRef({});
  const repoPath = locator?.repoPath;
  const number = locator?.pullRequestNumber;
  useLayoutEffect(() => {
    if (!controller || !repoPath || !number) return;
    const input = { repoPath, pullRequestNumber: number };
    const revisionOwner = owner.current;
    controller.setRevisionPending(input, revisionOwner, pending);
    return () => controller.setRevisionPending(input, revisionOwner, false);
  }, [controller, repoPath, number, pending]);
}
