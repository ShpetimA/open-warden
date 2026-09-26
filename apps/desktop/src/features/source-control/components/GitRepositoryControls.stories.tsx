import type { Meta, StoryObj } from "@storybook/react-vite";

import { RepositoryControlButtons } from "./GitRepositoryControls";

const meta = {
  title: "Features/Git/Repository controls",
  component: RepositoryControlButtons,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[320px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    busy: false,
    open: () => {},
    state: {
      operation: null,
      conflicts: [],
      lastCommit: null,
      stashes: [],
      branch: "feature/tabs",
      upstream: "origin/feature/tabs",
      ahead: 2,
      behind: 0,
      remotes: ["origin"],
      branches: [
        { name: "feature/tabs", remote: false, worktree: "/projects/warden" },
        { name: "main", remote: false, worktree: "" },
        { name: "fix/login", remote: false, worktree: "/projects/login-worktree" },
        { name: "origin/main", remote: true, worktree: "" },
      ],
      tags: [{ name: "v1.0.0", commitId: "a".repeat(40) }],
      worktrees: [{ path: "/projects/warden", branch: "feature/tabs", commitId: "a".repeat(40) }],
      incoming: [],
      outgoing: [{ id: "def5678", subject: "Polish project tabs" }],
    },
  },
} satisfies Meta<typeof RepositoryControlButtons>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TrackingBranch: Story = {};
export const Busy: Story = { args: { busy: true } };
export const Unpublished: Story = {
  args: {
    state: { ...meta.args.state, upstream: "", ahead: 0, behind: 0, incoming: [], outgoing: [] },
  },
};
