import { useState } from "react";
import {
  useGetPullRequestActivityQuery,
  useGetPullRequestConversationQuery,
} from "@/features/hosted-repos/api";
import { usePullRequestComparison } from "../hooks/usePullRequestComparison";
import {
  usePullRequestRefresh,
  useRetainPullRequestRefresh,
} from "../refresh/PullRequestRefreshProvider";
import type {
  FileItem,
  PullRequestActivity,
  PullRequestCompareRefs,
  PullRequestConversation,
  PullRequestLocatorInput,
} from "@/platform/desktop";

const RESOURCES = ["activity"] as const;
type TimelineSnapshot = Readonly<{
  key: string;
  conversation: PullRequestConversation;
  activity: PullRequestActivity | undefined;
  refs: PullRequestCompareRefs | undefined;
  files: FileItem[] | undefined;
}>;

export function usePullRequestTimelineSnapshot(locator: PullRequestLocatorInput) {
  useRetainPullRequestRefresh(locator, RESOURCES);
  const refresh = usePullRequestRefresh(locator);
  const conversationQuery = useGetPullRequestConversationQuery(locator, {
    selectFromResult: timelineRead,
  });
  const activityQuery = useGetPullRequestActivityQuery(locator, { selectFromResult: timelineRead });
  const comparison = usePullRequestComparison(locator);
  const [retained, setRetained] = useState<TimelineSnapshot | null>(null);
  const key = `${locator.repoPath}\0${locator.pullRequestNumber}`;
  const previous = retained?.key === key ? retained : null;
  const conversation = conversationQuery.currentData;
  const activity = activityQuery.currentData;
  const error = conversationQuery.error ?? activityQuery.error ?? comparison.failure;
  const comparisonSettled = !comparison.stale || (!comparison.refs && Boolean(comparison.error));
  const ready =
    conversation &&
    !refresh.busy &&
    !conversationQuery.isFetching &&
    !activityQuery.isFetching &&
    (activity !== undefined || Boolean(activityQuery.error)) &&
    comparisonSettled &&
    (!previous || !error);

  if (
    ready &&
    (!previous ||
      previous.conversation !== conversation ||
      previous.activity !== activity ||
      previous.refs !== comparison.refs ||
      previous.files !== comparison.files)
  ) {
    setRetained({ key, conversation, activity, refs: comparison.refs, files: comparison.files });
  }

  return {
    description: (previous?.conversation ?? conversation)?.detail,
    snapshot: previous,
    comparison,
    error,
  };
}

function timelineRead<T>({
  currentData,
  isFetching,
  error,
}: {
  currentData?: T;
  isFetching: boolean;
  error?: unknown;
}) {
  return { currentData, isFetching, error };
}
