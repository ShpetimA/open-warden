import { FileCode2, GitCommitHorizontal } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import { ResizableSidebarLayout } from "@/components/layout/ResizableSidebarLayout";
import { Input } from "@/components/ui/input";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  usePullRequestPaneNavigation,
  type PullRequestNavigationTarget,
} from "@/features/pull-requests/hooks/usePullRequestPaneNavigation";
import { cn } from "@/lib/utils";
import type { HistoryCommit } from "@/platform/desktop";

export type PullRequestChangesView = "files" | "commits";

type PullRequestCommitListProps = Readonly<{
  commits: readonly HistoryCommit[];
  selectedCommit: HistoryCommit | null;
  onCommitSelect: (commit: HistoryCommit) => void;
  commitsLoading: boolean;
  commitsError: string;
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
      className="h-full min-h-0"
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
      <div className="border-border flex shrink-0 flex-col gap-1 border-b px-2 py-2">
        <div className="text-muted-foreground flex items-center justify-between text-[11px]">
          <span className="font-medium uppercase tracking-wider">PR commits</span>
          <span className="tabular-nums">{visibleCommits.length}</span>
        </div>
        <Input
          aria-label="Filter commits"
          placeholder="Filter commits…"
          className="h-7 px-2 text-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-nav-region="pr-commits">
        {commitsLoading ? (
          <ListLoadingState label="Loading commits…" />
        ) : commitsError ? (
          <p role="alert" className="text-destructive p-3 text-xs">
            {commitsError}
          </p>
        ) : visibleCommits.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">
            {commits.length ? "No matching commits." : "No commits in this pull request."}
          </p>
        ) : (
          visibleCommits.map((commit, index) => (
            <button
              key={commit.commitId}
              data-nav-index={index}
              type="button"
              aria-pressed={selectedCommit?.commitId === commit.commitId}
              title={commit.summary}
              onClick={() => onCommitSelect(commit)}
              className={cn(
                "hover:bg-accent focus-visible:ring-ring/50 flex min-h-10 w-full min-w-0 flex-col gap-0.5 border-l-2 border-transparent px-2 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset",
                selectedCommit?.commitId === commit.commitId && "border-primary bg-surface-active",
              )}
            >
              <span className="w-full truncate text-xs font-medium">{commit.summary}</span>
              <span className="text-muted-foreground flex w-full min-w-0 gap-2 text-[11px]">
                <span className="shrink-0 font-mono">{commit.shortId}</span>
                <span className="min-w-0 truncate">{commit.author}</span>
                <span className="ml-auto shrink-0 tabular-nums">{commit.relativeTime}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
