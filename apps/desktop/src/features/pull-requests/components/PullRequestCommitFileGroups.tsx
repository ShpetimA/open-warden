import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import type { FileTreeSortComparator } from "@pierre/trees";
import { useState } from "react";

import { FilePaneEmpty, FilePaneHeader } from "@/features/source-control/components/FilePaneHeader";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import {
  buildCommitGroupFiles,
  commitGroupTitle,
  type CommitFileGroup,
} from "@/features/pull-requests/commitFileGroups";
import { SelectedPierreFileTree } from "@/features/source-control/components/SelectedPierreFileTree";
import { selectPullRequestFilePath } from "@/features/source-control/fileSelection";
import { CommitHoverDetails } from "@/features/source-control/components/CommitHoverDetails";
import { buildGitStatusForDisplayFiles } from "@/features/source-control/components/pierreFileTree";
import { ReviewFileViewControl } from "@/features/source-control/components/ReviewFileViewControl";
import {
  compareReviewFileEntries,
  type ReviewFileView,
} from "@/features/source-control/components/reviewFileGrouping";
import { useVerticalNavigationHotkeys } from "@/features/source-control/hooks/keyboardNavigation";
import { movePierreFileTreeFileForKey } from "@/features/source-control/pierreFileTreeNavigation";
import { isTypingTarget } from "@/features/source-control/utils";
import type { FileItem, HistoryCommit } from "@/platform/desktop";

export function PullRequestCommitFileGroups({
  groups,
  selectedCommit,
  loading,
  error,
  onRetry,
  onSelect,
  onGroupingChange,
}: {
  groups: readonly CommitFileGroup[];
  selectedCommit: HistoryCommit | null;
  loading: boolean;
  error: string;
  onRetry?: () => void;
  onSelect: (commit: HistoryCommit, file: FileItem) => void;
  onGroupingChange: (view: ReviewFileView) => void;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const displayFiles = buildCommitGroupFiles(groups).filter(
    (file) =>
      file.realPath.toLowerCase().includes(query) ||
      file.commit.summary.toLowerCase().includes(query),
  );
  const groupOrder = new Map(groups.map(({ commit }, index) => [commitGroupTitle(commit), index]));
  const fileByPath = new Map(displayFiles.map((file) => [file.path, file]));
  const groupCounts = new Map<string, number>();
  for (const file of displayFiles) {
    const title = commitGroupTitle(file.commit);
    groupCounts.set(title, (groupCounts.get(title) ?? 0) + 1);
  }
  const displayPathBySourcePath = new Map(
    displayFiles
      .filter((file) => file.commit.commitId === selectedCommit?.commitId)
      .map((file) => [file.realPath, file.path]),
  );
  const compareGroups = (left: { path: string }, right: { path: string }) =>
    (groupOrder.get(left.path.split("/")[0] ?? "") ?? 0) -
    (groupOrder.get(right.path.split("/")[0] ?? "") ?? 0);
  const sort: FileTreeSortComparator = (left, right) =>
    compareGroups(left, right) || compareReviewFileEntries(left, right);

  function navigate(event: KeyboardEvent, forward: boolean) {
    if (isTypingTarget(event.target)) return;
    const next = movePierreFileTreeFileForKey("pr-commit-groups", event.key, forward);
    const file = next ? fileByPath.get(next.path) : undefined;
    if (!file) return;
    event.preventDefault();
    onSelect(file.commit, file.source);
  }

  useVerticalNavigationHotkeys({
    onNext: (event) => navigate(event, true),
    onPrevious: (event) => navigate(event, false),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <FilePaneHeader
        title="PR files"
        summary={`${groups.length} commits`}
        filter={filter}
        onFilterChange={setFilter}
        filterLabel="Filter changed files"
        placeholder="Filter files or commits…"
        actions={
          <ReviewFileViewControl
            value="review"
            onChange={onGroupingChange}
            compact
            commitGrouping={{ selected: true, onSelect: () => {} }}
          />
        }
      />
      {error && groups.length > 0 ? (
        <ErrorNotice
          title="Couldn’t refresh commits and files"
          error={undefined}
          message={error}
          recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
        />
      ) : null}
      {loading && !error && groups.length === 0 ? (
        <ListLoadingState label="Loading files by commit…" />
      ) : error && groups.length === 0 ? (
        <ErrorState
          title="Couldn’t load commits and files"
          error={undefined}
          message={error}
          busy={loading}
          recovery={onRetry ? { label: "Retry", onAction: onRetry } : undefined}
        />
      ) : displayFiles.length === 0 ? (
        <FilePaneEmpty
          filtered={Boolean(query)}
          description="No changed files in these commits."
          onClear={() => setFilter("")}
        />
      ) : (
        <SelectedPierreFileTree
          selectFirstFile
          files={displayFiles}
          selection={selectPullRequestFilePath}
          displayPathBySourcePath={displayPathBySourcePath}
          navRegion="pr-commit-groups"
          flattenEmptyDirectories={false}
          directoryLabelPriority="start"
          renderHoverContent={(path) => {
            const group = groups.find(
              ({ commit }) => commitGroupTitle(commit) === path.replace(/\/$/, ""),
            );
            return group ? (
              <CommitHoverDetails commitId={group.commit.commitId} summary={group.commit.summary} />
            ) : undefined;
          }}
          sort={sort}
          compareTreeDirectories={(left, right) =>
            compareGroups(left, right) || left.path.localeCompare(right.path)
          }
          gitStatus={buildGitStatusForDisplayFiles(displayFiles, (file) => file.status)}
          onActivatePath={(path) => {
            const file = fileByPath.get(path);
            if (file) onSelect(file.commit, file.source);
          }}
          renderRowDecoration={({ item }) => {
            const count = groupCounts.get(item.path.replace(/\/$/, ""));
            return count !== undefined
              ? { text: String(count), title: `${count} ${count === 1 ? "file" : "files"}` }
              : null;
          }}
        />
      )}
    </div>
  );
}
