import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentStateGallery } from "@/design-system/storybook/ComponentStateGallery";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { StatusBadge } from "./status-badge";

const meta = {
  title: "Design system/Components/Status Badge",
  component: StatusBadge,
  args: {
    children: "Published",
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <DesignSystemCanvas
      title="Status badges"
      description="Badges name durable state. Their dot carries semantic color while text remains readable in both themes."
    >
      <ComponentStateGallery
        states={[
          { label: "Neutral", content: <StatusBadge>Local</StatusBadge> },
          { label: "Information", content: <StatusBadge tone="info">In review</StatusBadge> },
          { label: "Success", content: <StatusBadge tone="success">Published</StatusBadge> },
          { label: "Warning", content: <StatusBadge tone="warning">Pending</StatusBadge> },
          { label: "Danger", content: <StatusBadge tone="danger">Failed</StatusBadge> },
          { label: "Compact", content: <StatusBadge size="sm">Draft</StatusBadge> },
          { label: "Without dot", content: <StatusBadge showDot={false}>3 checks</StatusBadge> },
        ]}
      />
    </DesignSystemCanvas>
  ),
};
