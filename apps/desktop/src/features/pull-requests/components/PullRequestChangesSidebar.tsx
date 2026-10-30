import { FileCode2, GitCommitHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePullRequestPaneNavigation,
  type PullRequestNavigationTarget,
} from "@/features/pull-requests/hooks/usePullRequestPaneNavigation";
import { CommitRow } from "@/components/ui/commit-row";
import { CommitListPane } from "@/features/source-control/components/CommitListPane";
import { CommitHoverDetails } from "@/features/source-control/components/CommitHoverDetails";
import type { HistoryCommit } from "@/platform/desktop";

export type PullRequestChangesView = "files" | "commits";

type PullRequestCommitListProps = Readonly<{
  commits: readonly HistoryCommit[];
  selectedCommit: HistoryCommit | null;
  onCommitSelect: (commit: HistoryCommit) => void;
  commitsLoading: boolean;
  commitsError: unknown;
  onRetryCommits?: () => void;
}>;

type PullRequestChangesSidebarProps = PullRequestCommitListProps &
  Readonly<{
    view: PullRequestChangesView;
    onViewChange: (view: PullRequestChangesView) => void;
    filesPane: ReactNode;
    children: ReactNode;
  }>;

export function PullRequestChangesSidebar({
  view,
  onViewChange,
  filesPane,
  children,
  ...commitProps
}: PullRequestChangesSidebarProps) {
  const target = useRef<PullRequestNavigationTarget>("commits");
  const files = (
    <aside
      aria-label="Changed files"
      className="bg-surface-toolbar flex h-full min-h-0 flex-col overflow-hidden"
      onPointerDown={() => {
        target.current = "files";
      }}
      onFocusCapture={() => {
        target.current = "files";
      }}
    >
      {filesPane}
    </aside>
  );

  return (
    <Tabs
      value={view}
      onValueChange={(value) => {
        if (value === "files" || value === "commits") onViewChange(value);
      }}
      className="relative h-full min-h-0"
    >
      <div className="border-border bg-surface-toolbar flex h-9 shrink-0 items-center border-b px-2">
        <TabsList aria-label="Pull request changes" className="p-0">
          <TabsTrigger value="files">
            <FileCode2 />
            Files
          </TabsTrigger>
          <TabsTrigger value="commits">
            <GitCommitHorizontal />
            Commits
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={view}>
        <ResizableSidebarLayout
          key={view}
          panelId="primary"
          sidebarDefaultSize={22}
          sidebarMinSize={14}
          sidebarMaxSize={36}
          sidebar={
            view === "commits" ? <PullRequestCommitPane {...commitProps} target={target} /> : files
          }
          content={
            view === "commits" ? (
              <ResizableSidebarLayout
                panelId="pr-files"
                sidebarDefaultSize={28}
                sidebarMinSize={18}
                sidebarMaxSize={45}
                sidebar={files}
                content={children}
              />
            ) : (
              children
            )
          }
        />
      </TabsContent>
    </Tabs>
  );
}

function PullRequestCommitPane({
  commits,
  selectedCommit,
  onCommitSelect,
  commitsLoading,
  commitsError,
  onRetryCommits,
  target,
}: PullRequestCommitListProps & {
  target: RefObject<PullRequestNavigationTarget>;
}) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visibleCommits = commits.filter((commit) =>
    [commit.summary, commit.commitId, commit.author].some((value) =>
      value.toLowerCase().includes(query),
    ),
  );
  usePullRequestPaneNavigation({ target, commits: visibleCommits, selectedCommit, onCommitSelect });

  return (
    <aside
      aria-label="Pull request commits"
      className="bg-surface-toolbar flex h-full min-h-0 flex-col overflow-hidden"
      onPointerDown={() => {
        target.current = "commits";
      }}
      onFocusCapture={() => {
        target.current = "commits";
      }}
    >
      <CommitListPane
        title="PR commits"
        commits={visibleCommits}
        totalCount={commits.length}
        filter={filter}
        onFilterChange={setFilter}
        navRegion="pr-commits"
        loading={commitsLoading}
        error={commitsError}
        onRetry={onRetryCommits}
        emptyMessage="No commits in this pull request."
        renderHoverContent={(commit) => (
          <CommitHoverDetails commitId={commit.commitId} summary={commit.summary} />
        )}
        renderRow={(commit, index) => (
          <CommitRow
            {...commit}
            navIndex={index}
            active={selectedCommit?.commitId === commit.commitId}
            onOpen={() => onCommitSelect(commit)}
          />
        )}
      />
    </aside>
  );
}
