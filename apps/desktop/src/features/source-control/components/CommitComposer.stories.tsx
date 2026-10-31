import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { CommitComposer } from "./CommitComposer";

const meta = {
  title: "Source control/Commit composer",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ stagedCount = 0, draft = "", busy = false }) {
  const [message, setMessage] = useState(draft);
  const input = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="bg-surface-toolbar w-[min(340px,calc(100vw-32px))] border">
      <CommitComposer
        message={message}
        stagedCount={stagedCount}
        busy={busy}
        canCommit={Boolean(stagedCount && message.trim() && !busy)}
        amending={false}
        inputRef={input}
        onMessage={setMessage}
        onSubmit={() => {}}
        options={
          <>
            <label className="flex items-center gap-2">
              <Checkbox />
              Amend last commit
            </label>
            <Button variant="ghost" size="xs">
              Undo commit
            </Button>
          </>
        }
      />
    </div>
  );
}

export const Clean: Story = { render: () => <Example /> };
export const Staged: Story = { render: () => <Example stagedCount={3} /> };
export const Draft: Story = { render: () => <Example draft="Validate invoice amounts" /> };
export const Committing: Story = {
  render: () => <Example stagedCount={3} draft="Validate invoice amounts" busy />,
};
