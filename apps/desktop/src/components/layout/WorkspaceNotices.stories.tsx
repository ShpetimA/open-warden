import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorNotice } from "@/components/ui/error-state";
import { WorkspaceNotices } from "./WorkspaceNotices";

const meta = {
  title: "Design system/Compositions/Workspace notices",
  component: WorkspaceNotices,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground relative h-80 w-[min(640px,90vw)] overflow-hidden rounded-md border">
        <Story />
        <p className="border-b px-3 py-2 text-xs">Workspace header stays in place</p>
        <p className="p-3 text-sm">The pane retains its dimensions when refresh fails.</p>
      </div>
    ),
  ],
} satisfies Meta<typeof WorkspaceNotices>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Quiet: Story = { args: { children: null } };
export const RetainedFailure: Story = {
  args: {
    children: (
      <ErrorNotice
        title="Couldn’t refresh"
        error={{
          operation: "refreshPullRequest",
          code: "network",
          message: "Check your connection and try again.",
        }}
        recovery={{ label: "Retry", onAction() {} }}
      />
    ),
  },
};
