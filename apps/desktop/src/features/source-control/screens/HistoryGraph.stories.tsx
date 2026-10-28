import type { Meta, StoryObj } from "@storybook/react-vite";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { useState } from "react";

import { buildHistoryGraph } from "../historyGraph";
import { HistoryGraphView } from "./HistoryGraphScreen";

const meta = {
  title: "History/Repository graph",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const id = (index: number) => (index + 1).toString(16).padStart(40, "0");
const data = buildHistoryGraph({
  shallow: false,
  commits: Array.from({ length: 350 }, (_, index) => ({
    commitId: id(index),
    shortId: id(index).slice(-8),
    summary:
      index === 0
        ? "Merge invoice validation"
        : index === 3
          ? "Validate negative invoice amounts"
          : `Improve invoice review flow ${350 - index}`,
    author: index % 3 === 0 ? "Alice Morgan" : index % 3 === 1 ? "Bob Chen" : "Carol Rivera",
    authorEmail:
      index % 3 === 0
        ? "alice@example.com"
        : index % 3 === 1
          ? "bob@example.com"
          : "carol@example.com",
    relativeTime: index < 4 ? "2 hours ago" : "3 days ago",
    authoredAt: "2026-10-27T12:00:00Z",
    parents:
      index === 0
        ? [id(1), id(3)]
        : index === 2 || index === 3
          ? [id(4)]
          : index === 349
            ? []
            : [id(index + 1)],
    refs:
      index === 0
        ? ["HEAD", "refs/heads/main", "refs/remotes/origin/main"]
        : index === 3
          ? ["refs/heads/invoice-validation"]
          : index === 10
            ? ["refs/tags/v1.8.0"]
            : [],
  })),
});

function Example({ shallow = false, empty = false }: { shallow?: boolean; empty?: boolean }) {
  const [opened, setOpened] = useState("");
  const view = empty ? buildHistoryGraph({ shallow: false, commits: [] }) : { ...data, shallow };
  return (
    <HotkeysProvider>
      <div className="bg-background flex h-screen min-h-[600px] flex-col">
        <HistoryGraphView data={view} onOpen={setOpened} onRefresh={() => {}} />
        {opened ? <output className="border-t p-2 text-xs">Opened commit {opened}</output> : null}
      </div>
    </HotkeysProvider>
  );
}
export const Repository: Story = { render: () => <Example /> };
export const ShallowClone: Story = { render: () => <Example shallow /> };
export const EmptyRepository: Story = { render: () => <Example empty /> };
