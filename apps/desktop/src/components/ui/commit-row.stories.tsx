import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { CommitRow, type CommitRowProps } from "@/components/ui/commit-row";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const meta = {
  title: "Design system/Components/Commit Row",
  component: CommitRow,
  parameters: { layout: "fullscreen" },
  args: {
    commitId: "81add08f9aef465cced2396de764fe54dd38d023",
    summary: "feat(design-system): add composable workspace tabs",
    shortId: "81add08f",
    author: "Timi",
    relativeTime: "12 min ago",
  },
} satisfies Meta<typeof CommitRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

function SelectableRow({ checked = false, ...props }: CommitRowProps & { checked?: boolean }) {
  const [selected, setSelected] = useState(checked);
  return <CommitRow {...props} selection={{ checked: selected, onCheckedChange: setSelected }} />;
}

export const SelectionStates: Story = {
  render: (args) => (
    <DesignSystemCanvas
      title="Compact commit rows"
      description="PRs and History share the same row. History adds comparison checkboxes while keeping the active commit separate."
    >
      <div className="bg-surface-toolbar max-w-md border">
        <CommitRow {...args} />
        <CommitRow {...args} summary="fix(history): retain the selected comparison range" active />
        <SelectableRow {...args} summary="refactor(search): share result metadata" checked />
        <CommitRow
          {...args}
          summary="chore: update generated API references"
          selection={{ checked: false, disabled: true, onCheckedChange: () => {} }}
        />
      </div>
    </DesignSystemCanvas>
  ),
};
