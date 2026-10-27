import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CommitRow } from "@/components/ui/commit-row";
import type { HistoryCommit } from "@/features/source-control/types";
import { CommitListPane } from "./CommitListPane";

const commits: readonly HistoryCommit[] = [
  {
    commitId: "c173df75c",
    shortId: "c173df75c",
    summary: "OF-11390: Update state URLs and split the onboarding flow",
    author: "Shpetim",
    relativeTime: "21 minutes ago",
  },
  {
    commitId: "b519dab4b9",
    shortId: "b519dab4b9",
    summary: "OF-11390: Store signup steps in the database",
    author: "Shpetim",
    relativeTime: "40 minutes ago",
  },
  {
    commitId: "28a726076b",
    shortId: "28a726076b",
    summary: "OF-11390: Type mock bodies and derive response contracts",
    author: "Shpetim",
    relativeTime: "47 minutes ago",
  },
];

const meta = {
  title: "Source control/Commit list pane",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function CommitPaneExample({ comparison = false, loading = false, error = "", empty = false }) {
  const [filter, setFilter] = useState("");
  const [activeId, setActiveId] = useState(commits[0].commitId);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const allCommits = empty ? [] : commits;
  const visibleCommits = allCommits.filter((commit) =>
    [commit.summary, commit.shortId, commit.author].some((value) =>
      value.toLowerCase().includes(filter.trim().toLowerCase()),
    ),
  );

  return (
    <div className="bg-surface-toolbar flex h-[640px] w-[min(320px,100%)] border-r">
      <CommitListPane
        title={comparison ? "History commits" : "PR commits"}
        commits={visibleCommits}
        totalCount={allCommits.length}
        filter={filter}
        onFilterChange={setFilter}
        navRegion="commit-pane-story"
        loading={loading}
        error={error}
        emptyMessage="No commits found."
        notice={
          selectedIds.length > 0 ? (
            <div className="bg-surface-active flex items-center justify-between gap-2 border-b px-2 py-1.5 text-[11px]">
              <span>
                {selectedIds.length === 2
                  ? "Showing combined changes"
                  : "Select one more commit to combine"}
              </span>
              <Button size="xs" variant="ghost" onClick={() => setSelectedIds([])}>
                Clear
              </Button>
            </div>
          ) : undefined
        }
        renderRow={(commit, index) => (
          <CommitRow
            {...commit}
            navIndex={index}
            active={activeId === commit.commitId}
            onOpen={() => {
              setActiveId(commit.commitId);
              setSelectedIds([]);
            }}
            selection={
              comparison
                ? {
                    checked: selectedIds.includes(commit.commitId),
                    disabled: selectedIds.length >= 2 && !selectedIds.includes(commit.commitId),
                    onCheckedChange: (checked) =>
                      setSelectedIds(
                        checked
                          ? [...selectedIds, commit.commitId]
                          : selectedIds.filter((id) => id !== commit.commitId),
                      ),
                  }
                : undefined
            }
          />
        )}
      />
    </div>
  );
}

export const PullRequest: Story = { render: () => <CommitPaneExample /> };
export const History: Story = { render: () => <CommitPaneExample comparison /> };
export const Loading: Story = { render: () => <CommitPaneExample loading /> };
export const Error: Story = {
  render: () => <CommitPaneExample error="Commit history could not be loaded." />,
};
export const Empty: Story = { render: () => <CommitPaneExample empty /> };
