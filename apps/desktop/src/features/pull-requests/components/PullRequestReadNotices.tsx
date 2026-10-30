import {
  usePullRequestRefresh,
  useRetainPullRequestRefresh,
} from "../refresh/PullRequestRefreshProvider";
import { ErrorNotice } from "@/components/ui/error-state";
import {
  useGetPullRequestActivityQuery,
  useGetPullRequestChecksQuery,
  useGetPullRequestFilesQuery,
  useGetPullRequestReviewOverviewQuery,
} from "@/features/hosted-repos/api";
import { desktopFailure } from "@/platform/desktop/failure";
import type { PullRequestLocatorInput } from "@/platform/desktop";

const REFRESH_RESOURCES = ["reviewers", "checks", "files", "activity"] as const;

export function PullRequestReadNotices({ locator }: { locator: PullRequestLocatorInput }) {
  useRetainPullRequestRefresh(locator, REFRESH_RESOURCES);
  const refresh = usePullRequestRefresh(locator);
  const reviews = useGetPullRequestReviewOverviewQuery(locator, { selectFromResult: noticeFields });
  const checks = useGetPullRequestChecksQuery(locator, {
    selectFromResult: (result) => ({
      ...noticeFields(result),
      fulfilledTimeStamp: result.currentData?.complete ? result.fulfilledTimeStamp : undefined,
      error:
        result.error ??
        (result.currentData && !result.currentData.complete
          ? desktopFailure(
              "getPullRequestChecks",
              "unavailable",
              "Only some checks could be loaded. Refresh or open the pull request in your provider to verify all checks.",
            )
          : undefined),
    }),
  });
  const files = useGetPullRequestFilesQuery(locator, { selectFromResult: noticeFields });
  const activity = useGetPullRequestActivityQuery(locator, { selectFromResult: noticeFields });

  return (
    <>
      {[
        { title: "Couldn’t load review status", query: reviews },
        { title: "Couldn’t load checks", query: checks },
        { title: "Couldn’t load file statistics", query: files },
        { title: "Couldn’t load activity", query: activity },
      ].map(({ title, query }) =>
        query.error ? (
          <ErrorNotice
            key={title}
            title={title}
            error={query.error}
            busy={query.isFetching}
            lastUpdated={query.fulfilledTimeStamp}
            recovery={{
              label: "Retry",
              onAction: () => {
                void refresh.refresh();
              },
            }}
          />
        ) : null,
      )}
    </>
  );
}

function noticeFields(result: {
  error?: unknown;
  isFetching: boolean;
  fulfilledTimeStamp?: number;
}) {
  return {
    error: result.error,
    isFetching: result.isFetching,
    fulfilledTimeStamp: result.fulfilledTimeStamp,
  };
}
