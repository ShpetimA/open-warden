import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestRefreshControl } from "./PullRequestRefreshControl";

const meta = {
  title: "Pull requests/Refresh",
  component: PullRequestRefreshControl,
  args: { locator: null, onRefreshList: () => {} },
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground inline-flex min-w-40 items-center justify-between gap-6 rounded-md border p-3">
        <span className="text-xs">Pull requests</span>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PullRequestRefreshControl>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Refreshing: Story = { args: { listBusy: true } };
export const RateLimited: Story = { args: { listRetryAt: Date.now() + 60000 } };
