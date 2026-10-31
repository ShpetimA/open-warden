import type { Meta, StoryObj } from "@storybook/react-vite";

import type { GitRepositoryState } from "@/platform/desktop/gitOperations";
import { RepositoryResourcesView } from "./RepositoryResources";

const meta = {
  title: "Source control/Repository resources",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const state: GitRepositoryState = {
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  remotes: ["origin"],
  branches: [],
  tags: [{ name: "v1.0.0", commitId: "a".repeat(40) }],
  worktrees: [
    { path: "/projects/invoice", branch: "main", commitId: "a".repeat(40) },
    {
      path: "/projects/invoice-preview",
      branch: "feature/invoice-validation",
      commitId: "b".repeat(40),
    },
  ],
  stashes: [{ oid: "c".repeat(40), label: "Invoice validation draft" }],
  operation: null,
  conflicts: [],
  lastCommit: null,
  incoming: [],
  outgoing: [],
};

function Example({ loading = false, empty = false, error = false }) {
  let value: GitRepositoryState | undefined = state;
  if (empty) value = { ...state, stashes: [], tags: [], worktrees: state.worktrees.slice(0, 1) };
  if (loading || error) value = undefined;

  return (
    <div className="bg-surface-toolbar w-[min(240px,calc(100vw-32px))] border p-2">
      <RepositoryResourcesView
        repoPath="/projects/invoice"
        state={value}
        busy={false}
        loading={loading}
        error={
          error
            ? {
                operation: "getGitRepositoryState",
                code: "git-failed",
                message: "Repository is temporarily unavailable.",
              }
            : undefined
        }
        onAction={() => {}}
        onOpenWorktree={() => {}}
        onRetry={() => {}}
      />
    </div>
  );
}

export const Default: Story = { render: () => <Example /> };
export const Empty: Story = { render: () => <Example empty /> };
export const Loading: Story = { render: () => <Example loading /> };
export const Failed: Story = { render: () => <Example error /> };
