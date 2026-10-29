import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowDown, ArrowUp, RefreshCw } from "lucide-react";

import { ToolbarAction } from "./toolbar-action";
import { TooltipProvider } from "./tooltip";

const meta = {
  title: "Design system/Components/Toolbar action",
  component: ToolbarAction,
  decorators: [
    (Story) => (
      <TooltipProvider delayDuration={450} skipDelayDuration={300}>
        <div className="bg-surface-toolbar flex items-center gap-1 rounded-md border p-2">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
  args: {
    label: "Fetch remote changes",
    description: "Choose a remote to fetch from",
    children: <RefreshCw />,
  },
} satisfies Meta<typeof ToolbarAction>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Available: Story = {};
export const Unavailable: Story = {
  args: {
    label: "Pull (fast-forward only)",
    disabledReason: "No incoming commits. Your branch is up to date.",
    children: <ArrowDown />,
  },
};
export const ActionGroup: Story = {
  render: () => (
    <>
      <ToolbarAction label="Fetch remote changes">
        <RefreshCw />
      </ToolbarAction>
      <ToolbarAction
        label="Pull (fast-forward only)"
        disabledReason="No incoming commits. Your branch is up to date."
      >
        <ArrowDown />
      </ToolbarAction>
      <ToolbarAction
        label="Push commits"
        description="6 outgoing commits · choose a remote to push to"
      >
        <ArrowUp />
      </ToolbarAction>
    </>
  ),
};
