import type { Meta, StoryObj } from "@storybook/react-vite";

import { HistoryCommitRow } from "@/components/ui/history-commit-row";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const meta = {
  title: "Design system/Components/History Commit Row",
  component: HistoryCommitRow,
  parameters: { layout: "fullscreen" },
  args: {
    summary: "feat(design-system): add composable workspace tabs",
    shortId: "81add08f",
    author: "Timi",
    relativeTime: "12 min ago",
  },
} satisfies Meta<typeof HistoryCommitRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SelectionStates: Story = {
  render: () => (
    <DesignSystemCanvas
      title="History commit rows"
      description="The active commit and the commits included in a comparison are separate, visible states."
    >
      <div className="grid max-w-4xl gap-3 md:grid-cols-2">
        <HistoryCommitRow
          summary="feat(desktop): add pull-request review tabs"
          shortId="f52c90ab"
          author="Timi"
          relativeTime="8 min ago"
        />
        <HistoryCommitRow
          summary="fix(history): retain the selected comparison range"
          shortId="204cc19e"
          author="Timi"
          relativeTime="34 min ago"
          active
        />
        <HistoryCommitRow
          summary="refactor(search): share resource result metadata"
          shortId="ae8b0dd1"
          author="Timi"
          relativeTime="2 hr ago"
          selected
        />
        <HistoryCommitRow
          summary="chore: update generated API references"
          shortId="6de209c4"
          author="Timi"
          relativeTime="1 day ago"
          selectionDisabled
        />
      </div>
    </DesignSystemCanvas>
  ),
};
