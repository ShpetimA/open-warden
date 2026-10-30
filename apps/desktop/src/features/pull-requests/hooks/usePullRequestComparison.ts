import { useGetCommitFileGroupsQuery } from "../commitFileGroupsApi";
import type { CommitFileGroup } from "../commitFileGroups";
import {
  usePullRequestRefresh,
  useReportPullRequestRevision,
  useRetainPullRequestRefresh,
} from "../refresh/PullRequestRefreshProvider";
import { desktopFailure, readDesktopFailure } from "@/platform/desktop/failure";
import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useRef, useState } from "react";
import {
  usePreparePullRequestCompareRefsQuery,
  useGetPullRequestConversationQuery,
} from "@/features/hosted-repos/api";
import { useGetBranchFilesQuery, useGetBranchCommitsQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type {
  FileItem,
  PullRequestCompareRefs,
  PullRequestConversation,
  HistoryCommit,
  PullRequestLocatorInput,
} from "@/platform/desktop";

const COMPARISON_RESOURCES = ["comparison", "comparison-files"] as const;
const COMMITS_RESOURCES = ["comparison", "comparison-files", "commits"] as const;
const GROUPS_RESOURCES = ["comparison", "comparison-files", "commits", "commit-groups"] as const;

export function usePullRequestComparison(
  locator: PullRequestLocatorInput | typeof skipToken,
  requirements: Readonly<{ commits?: boolean; groups?: boolean }> = {},
) {
  const resources = requirements.groups
    ? GROUPS_RESOURCES
    : requirements.commits
      ? COMMITS_RESOURCES
      : COMPARISON_RESOURCES;
  useRetainPullRequestRefresh(locator === skipToken ? null : locator, resources);
  const refresh = usePullRequestRefresh(locator === skipToken ? null : locator);
  const {
    currentData: refs,
    isFetching,
    error,
    refetch,
  } = usePreparePullRequestCompareRefsQuery(locator);
  const conversationQuery = useGetPullRequestConversationQuery(locator);
  const conversation = conversationQuery.currentData;
  const expectedRevision = conversation?.detail;
  const expectedHeadSha = expectedRevision?.headSha;
  const expectedBaseSha = expectedRevision?.baseSha;
  const revisionKey =
    locator === skipToken
      ? ""
      : `${locator.repoPath}\0${locator.pullRequestNumber}\0${expectedHeadSha}\0${expectedBaseSha}`;
  const refreshedRevision = useRef("");
  const matchesRevision = Boolean(
    expectedRevision &&
    refs?.compareHeadRef.startsWith(expectedRevision.headSha) &&
    refs.baseSha.startsWith(expectedRevision.baseSha),
  );

  useEffect(() => {
    const failure = readDesktopFailure(error);
    if (
      failure &&
      (["authentication", "permission", "invalid-input", "not-found"].includes(failure.code) ||
        (failure.retryAt ?? 0) > Date.now())
    )
      return;
    if (!refs || !expectedHeadSha || matchesRevision || refreshedRevision.current === revisionKey)
      return;
    refreshedRevision.current = revisionKey;
    void refetch();
  }, [refs, expectedHeadSha, revisionKey, matchesRevision, refetch, error]);

  const filesQuery = useGetBranchFilesQuery(
    locator !== skipToken && refs && matchesRevision
      ? { repoPath: locator.repoPath, baseRef: refs.compareBaseRef, headRef: refs.compareHeadRef }
      : skipToken,
  );
  const comparisonArg =
    locator !== skipToken && refs && matchesRevision
      ? { repoPath: locator.repoPath, baseRef: refs.compareBaseRef, headRef: refs.compareHeadRef }
      : skipToken;
  const commitsQuery = useGetBranchCommitsQuery(requirements.commits ? comparisonArg : skipToken);
  const groupsQuery = useGetCommitFileGroupsQuery(requirements.groups ? comparisonArg : skipToken);
  const commits = commitsQuery.currentData;
  const groups = groupsQuery.currentData;
  const requiredDataReady =
    (!requirements.commits || commits !== undefined) &&
    (!requirements.groups || groups !== undefined);
  const key = locator === skipToken ? "" : `${locator.repoPath}\0${locator.pullRequestNumber}`;
  const [retained, setRetained] = useState<{
    key: string;
    refs: PullRequestCompareRefs;
    files: FileItem[];
    conversation: PullRequestConversation;
    commits?: HistoryCommit[];
    groups?: CommitFileGroup[];
  } | null>(null);
  const currentFiles = filesQuery.currentData;
  const ready = Boolean(
    refs && matchesRevision && currentFiles && requiredDataReady && conversation,
  );

  if (
    refs &&
    matchesRevision &&
    currentFiles &&
    conversation &&
    requiredDataReady &&
    (retained?.key !== key ||
      retained.refs !== refs ||
      retained.files !== currentFiles ||
      retained.conversation !== conversation ||
      retained.commits !== commits ||
      retained.groups !== groups)
  ) {
    setRetained({ key, refs, files: currentFiles, conversation, commits, groups });
  }

  const displayed =
    ready && refs && currentFiles && conversation
      ? { refs, files: currentFiles, conversation, commits, groups }
      : retained?.key === key
        ? retained
        : null;
  const comparisonError =
    errorMessageFrom(
      error ??
        conversationQuery.error ??
        filesQuery.error ??
        commitsQuery.error ??
        groupsQuery.error,
      "",
    ) ||
    (refs && !matchesRevision && !isFetching && refreshedRevision.current === revisionKey
      ? "The PR comparison does not match this revision. Refresh the pull request and try again."
      : "");

  useReportPullRequestRevision(locator === skipToken ? null : locator, !ready);

  return {
    refs: displayed?.refs,
    files: displayed?.files,
    conversation: displayed?.conversation,
    commits: displayed?.commits,
    groups: displayed?.groups,
    stale: !ready,
    loading: locator !== skipToken && !comparisonError && !displayed,
    error: comparisonError,
    failure:
      error ??
      conversationQuery.error ??
      filesQuery.error ??
      commitsQuery.error ??
      groupsQuery.error ??
      (comparisonError
        ? desktopFailure("preparePullRequestCompareRefs", "conflict", comparisonError)
        : undefined),
    refreshing: isFetching || filesQuery.isFetching,
    retry() {
      if (locator === skipToken) return;
      if (error || conversationQuery.error || !refs || !matchesRevision) void refresh.refresh();
      else if (commitsQuery.error) void commitsQuery.refetch();
      else if (groupsQuery.error) void groupsQuery.refetch();
      else void filesQuery.refetch();
    },
  };
}
