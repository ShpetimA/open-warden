import type { Meta, StoryObj } from "@storybook/react-vite";
import { PullRequestRevisionNotice } from "./PullRequestRevisionNotice";

const meta = {
  title: "Pull requests/Revision handoff",
  component: PullRequestRevisionNotice,
  args: { stale: true, hasContent: true },
  decorators: [
    (Story) => (
      <div className="relative bg-background text-foreground h-48 w-80 overflow-hidden rounded-md border">
        <Story />
        <p className="text-muted-foreground p-3 text-xs">Previous revision remains available.</p>
      </div>
    ),
  ],
} satisfies Meta<typeof PullRequestRevisionNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LoadingNewRevision: Story = {};
export const CurrentRevision: Story = { args: { stale: false } };
export const InitialRead: Story = { args: { hasContent: false } };
