import type { FileTreeSortComparator } from "@pierre/trees";
import { useState } from "react";

import { useAppSelector } from "@/app/hooks";
import { Input } from "@/components/ui/input";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import {
  buildCommitGroupFiles,
  commitGroupTitle,
  type CommitFileGroup,
} from "@/features/pull-requests/commitFileGroups";
import { PierreFileTreeBrowser } from "@/features/source-control/components/PierreFileTreeBrowser";
import { buildGitStatusForDisplayFiles } from "@/features/source-control/components/pierreFileTree";
import { ReviewFileViewControl } from "@/features/source-control/components/ReviewFileViewControl";
import {
  compareReviewFileEntries,
  type ReviewFileView,
} from "@/features/source-control/components/reviewFileGrouping";
import { useVerticalNavigationHotkeys } from "@/features/source-control/hooks/keyboardNavigation";
import {
  movePierreFileTreeFocusByFile,
  movePierreFileTreeFocusFile,
} from "@/features/source-control/pierreFileTreeNavigation";
import { isTypingTarget } from "@/features/source-control/utils";
import type { FileItem, HistoryCommit } from "@/platform/desktop";

export function PullRequestCommitFileGroups({
  groups,
  selectedCommit,
  loading,
  error,
  onSelect,
  onGroupingChange,
}: {
  groups: readonly CommitFileGroup[];
  selectedCommit: HistoryCommit | null;
  loading: boolean;
  error: string;
  onSelect: (commit: HistoryCommit, file: FileItem) => void;
  onGroupingChange: (view: ReviewFileView) => void;
}) {
  const [filter, setFilter] = useState("");
  const activePath = useAppSelector((state) => state.pullRequests.previewActiveFilePath);
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
  const selectedPath =
    displayFiles.find(
      (file) => file.commit.commitId === selectedCommit?.commitId && file.realPath === activePath,
    )?.path ?? "";
  const compareGroups = (left: { path: string }, right: { path: string }) =>
    (groupOrder.get(left.path.split("/")[0] ?? "") ?? 0) -
    (groupOrder.get(right.path.split("/")[0] ?? "") ?? 0);
  const sort: FileTreeSortComparator = (left, right) =>
    compareGroups(left, right) || compareReviewFileEntries(left, right);

  function navigate(event: KeyboardEvent, forward: boolean) {
    if (isTypingTarget(event.target)) return;
    const move = /^[jk]$/i.test(event.key)
      ? movePierreFileTreeFocusByFile
      : movePierreFileTreeFocusFile;
    const next = move("pr-commit-groups", forward);
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
      <div className="border-border flex shrink-0 flex-col gap-1 border-b px-2 py-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground tabular-nums">{groups.length} commits</span>
          <ReviewFileViewControl
            value="review"
            onChange={onGroupingChange}
            compact
            commitGrouping={{ selected: true, onSelect: () => {} }}
          />
        </div>
        <Input
          aria-label="Filter changed files"
          placeholder="Filter files or commits…"
          className="h-7 px-2 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {loading ? (
        <ListLoadingState label="Loading files by commit…" />
      ) : error ? (
        <p role="alert" className="text-destructive p-3 text-xs">
          {error}
        </p>
      ) : displayFiles.length === 0 ? (
        <p className="text-muted-foreground p-3 text-xs">
          {query ? "No files match the current filter." : "No changed files in these commits."}
        </p>
      ) : (
        <PierreFileTreeBrowser
          files={displayFiles}
          selectedPath={selectedPath}
          navRegion="pr-commit-groups"
          flattenEmptyDirectories={false}
          directoryLabelPriority="start"
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
