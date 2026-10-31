import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { FilePaneEmpty, FilePaneHeader } from "./FilePaneHeader";
import { ReviewFileViewControl } from "./ReviewFileViewControl";
import type { ReviewFileView } from "./reviewFileGrouping";

const meta = {
  title: "Source control/File pane",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ empty = false, loading = false }) {
  const [filter, setFilter] = useState(empty ? "missing" : "");
  const [view, setView] = useState<ReviewFileView>("review");

  let summary: string | undefined = filter ? "0/154 files" : "154 files";
  if (loading) summary = undefined;

  return (
    <div className="bg-surface-toolbar h-80 w-[min(320px,calc(100vw-32px))] border">
      <FilePaneHeader
        title="Changed files"
        summary={summary}
        filter={filter}
        onFilterChange={setFilter}
        actions={<ReviewFileViewControl value={view} onChange={setView} compact />}
      />
      {filter ? (
        <FilePaneEmpty filtered description="" onClear={() => setFilter("")} />
      ) : (
        <p className="text-muted-foreground p-3 text-xs">
          {loading ? "Loading changed files…" : "File tree"}
        </p>
      )}
    </div>
  );
}

export const Default: Story = { render: () => <Example /> };
export const NoMatches: Story = { render: () => <Example empty /> };
export const Loading: Story = { render: () => <Example loading /> };
