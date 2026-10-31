import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkingFileActions } from "./WorkingFileActions";

const meta = {
  title: "Source control/Working file actions",
  component: WorkingFileActions,
  decorators: [
    (Story) => (
      <div className="bg-surface-toolbar flex w-[420px] max-w-full items-center justify-between gap-3 border p-2">
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
          src/invoices/InvoiceList.tsx
        </span>
        <Story />
      </div>
    ),
  ],
  args: {
    dirty: false,
    saving: false,
    reloading: false,
    hasError: false,
    onSave: () => {},
    onReload: () => {},
  },
} satisfies Meta<typeof WorkingFileActions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Saved: Story = {};
export const Unsaved: Story = { args: { dirty: true } };
export const Saving: Story = { args: { dirty: true, saving: true } };
export const Reloading: Story = { args: { dirty: true, reloading: true } };
export const Failed: Story = { args: { dirty: true, hasError: true } };

export const Removing: Story = { args: { dirty: true, removing: true } };
