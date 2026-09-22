import type { Meta, StoryObj } from "@storybook/react-vite";
import { RepositoryActions } from "./GitRepositoryControls";
const meta = {
  title: "Features/Git/Repository actions",
  component: RepositoryActions,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[520px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    repoPath: "/projects/warden",
    busy: false,
    run: async () => {},
    state: {
      branch: "feature/tabs",
      upstream: "origin/feature/tabs",
      ahead: 2,
      behind: 1,
      remotes: ["origin"],
      branches: [
        { name: "feature/tabs", remote: false, worktree: "/projects/warden" },
        { name: "main", remote: false, worktree: "" },
        { name: "fix/login", remote: false, worktree: "/projects/login-worktree" },
        { name: "origin/main", remote: true, worktree: "" },
      ],
      incoming: [{ id: "abc1234", subject: "Fix branch sync" }],
      outgoing: [{ id: "def5678", subject: "Polish project tabs" }],
    },
  },
} satisfies Meta<typeof RepositoryActions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TrackingBranch: Story = {};
export const Busy: Story = { args: { busy: true } };
export const Unpublished: Story = {
  args: {
    state: { ...meta.args.state, upstream: "", ahead: 0, behind: 0, incoming: [], outgoing: [] },
  },
};
