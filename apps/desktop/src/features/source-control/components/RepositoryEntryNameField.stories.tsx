import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";

import { FileList } from "./FileList";
import { RepositoryEntryNameField } from "./RepositoryEntryNameField";

function InlineCreation({
  busy = false,
  error = null,
  initialValue = "",
}: {
  busy?: boolean;
  error?: string | null;
  initialValue?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);
  const [editing, setEditing] = useState(true);
  return (
    <div className="bg-surface-toolbar flex h-64 w-80 max-w-full flex-col border">
      <FileList
        files={[{ path: "src/invoice.ts" }, { path: "src/validation.ts" }, { path: "README.md" }]}
        mode="tree"
        selection=""
        navRegion="inline-creation-story"
        autoFocus={false}
        onActivatePath={() => {}}
        inlineEditor={
          editing
            ? {
                path: "src/.new-entry",
                anchorPath: "src/invoice.ts",
                children: (
                  <RepositoryEntryNameField
                    inputRef={inputRef}
                    prefix="src/"
                    value={value}
                    busy={busy}
                    error={error}
                    onChange={setValue}
                    onSubmit={() => setEditing(false)}
                    onCancel={() => setEditing(false)}
                    onLeave={() => {}}
                  />
                ),
              }
            : undefined
        }
      />
    </div>
  );
}

const meta = {
  title: "Source control/Inline file creation",
  component: InlineCreation,
  args: { busy: false, error: null, initialValue: "" },
} satisfies Meta<typeof InlineCreation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const NestedFile: Story = { args: { initialValue: "exports/download.ts" } };
export const Folder: Story = { args: { initialValue: "exports/" } };
export const Creating: Story = { args: { initialValue: "download.ts", busy: true } };
export const ExistingName: Story = {
  args: {
    initialValue: "invoice.ts",
    error: "A file or folder already exists at this path. Choose another name.",
  },
};
