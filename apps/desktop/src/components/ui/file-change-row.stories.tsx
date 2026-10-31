import type { Meta, StoryObj } from "@storybook/react-vite";

import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { FileChangeRow } from "./file-change-row";

const meta = {
  title: "Design system/Compositions/File Change Row",
  component: FileChangeRow,
  parameters: { layout: "fullscreen" },
  args: {
    path: "src/features/source-control/ChangesScreen.tsx",
    status: "modified",
    additions: 38,
    deletions: 12,
  },
} satisfies Meta<typeof FileChangeRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <DesignSystemCanvas
      title="File change row"
      description="A stable leading status column and trailing metadata keep dense lists easy to scan."
    >
      <div className="bg-surface max-w-2xl rounded-xl p-1.5 shadow-[var(--elevation-surface)]">
        <FileChangeRow {...args} />
      </div>
    </DesignSystemCanvas>
  ),
};

export const States: Story = {
  render: () => (
    <DesignSystemCanvas
      title="File row states"
      description="Status is expressed through a letter, label, and semantic color. Selection remains visually distinct from file status."
    >
      <div className="bg-surface max-w-2xl space-y-0.5 rounded-xl p-1.5 shadow-[var(--elevation-surface)]">
        <FileChangeRow path="src/components/ui/status-badge.tsx" status="added" additions={74} />
        <FileChangeRow
          path="src/components/ui/file-change-row.tsx"
          status="modified"
          additions={38}
          deletions={12}
          selected
        />
        <FileChangeRow path="src/legacy/OldStatus.tsx" status="deleted" deletions={42} />
        <FileChangeRow
          path="src/app/theme.ts"
          previousPath="src/app/colors.ts"
          status="renamed"
          additions={3}
          deletions={2}
        />
        <FileChangeRow
          path="src/features/review/ReviewPanel.tsx"
          status="modified"
          additions={18}
          deletions={11}
          commentCount={3}
        />
        <FileChangeRow path="src/features/source-control/conflicts.ts" status="conflicted" />
        <FileChangeRow path="notes/design-ideas.md" status="untracked" />
      </div>
    </DesignSystemCanvas>
  ),
};
