import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { RepositoryEntryContextMenu } from "./RepositoryEntryContextMenu";

function FileActions({ disabled = false }: { disabled?: boolean }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-surface-toolbar h-40 w-72 border p-3">
      <Button ref={setAnchor} variant="ghost" size="sm" onClick={() => setOpen(true)}>
        README.md
      </Button>
      {open && anchor ? (
        <RepositoryEntryContextMenu
          disabled={disabled}
          context={{
            anchorElement: anchor,
            anchorRect: anchor.getBoundingClientRect(),
            close: () => setOpen(false),
            restoreFocus: () => anchor.focus(),
          }}
          onTrash={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
const meta = {
  title: "Source control/Repository file actions",
  component: FileActions,
  args: { disabled: false },
} satisfies Meta<typeof FileActions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const MoveToTrash: Story = {};
export const Busy: Story = { args: { disabled: true } };
