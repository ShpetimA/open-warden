import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentStateGallery } from "@/design-system/storybook/ComponentStateGallery";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { DiffStat } from "./diff-stat";

const meta = {
  title: "Design system/Components/Diff Stat",
  component: DiffStat,
  args: {
    kind: "addition",
    value: 24,
  },
} satisfies Meta<typeof DiffStat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Semantics: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <DesignSystemCanvas
      title="Diff statistics"
      description="Signed values stay compact and use tabular numerals. Accessible labels preserve meaning beyond color and punctuation."
    >
      <ComponentStateGallery
        states={[
          { label: "Additions", content: <DiffStat kind="addition" value={284} /> },
          { label: "Deletions", content: <DiffStat kind="deletion" value={91} /> },
          { label: "Modifications", content: <DiffStat kind="modification" value={18} /> },
          { label: "Conflicts", content: <DiffStat kind="conflict" value={2} /> },
          { label: "Files", content: <DiffStat kind="neutral" value={18} showLabel /> },
        ]}
      />
    </DesignSystemCanvas>
  ),
};
