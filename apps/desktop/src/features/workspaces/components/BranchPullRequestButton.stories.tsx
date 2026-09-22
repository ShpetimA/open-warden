import type { Meta, StoryObj } from "@storybook/react-vite";
import { BranchPullRequestButton } from "./BranchPullRequestButton";

const meta = {
  title: "Features/Workspaces/Branch pull request",
  component: BranchPullRequestButton,
  args: {
    branch: "feature/OF-11231-session-id",
    number: 1678,
    title: "Include session ID in requests",
    onClick: () => {},
  },
  decorators: [
    (Story) => (
      <div className="bg-surface-toolbar w-14 p-2">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BranchPullRequestButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentBranch: Story = {};
export const LargeNumber: Story = { args: { number: 123456 } };
