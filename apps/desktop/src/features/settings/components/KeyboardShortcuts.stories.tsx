import type { Meta, StoryObj } from "@storybook/react-vite";
import { KeyboardShortcuts } from "./KeyboardShortcuts";
const meta = {
  title: "Features/Settings/Keyboard shortcuts",
  component: KeyboardShortcuts,
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[600px] max-w-full p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KeyboardShortcuts>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference: Story = {};
