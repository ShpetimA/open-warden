import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitOperationStatus } from "./GitOperationBanner";
const meta = {
  title: "Features/Git/Operation status",
  component: GitOperationStatus,
  args: {
    operation: "rebase",
    conflictCount: 3,
    busy: false,
    onResolve: () => {},
    onContinue: () => {},
    onAbort: () => {},
  },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof GitOperationStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Conflicts: Story = {};
export const Ready: Story = { args: { conflictCount: 0 } };
export const StashConflict: Story = { args: { operation: null, conflictCount: 1 } };
