import type { Meta, StoryObj } from "@storybook/react-vite";

import { ComponentStateGallery } from "@/design-system/storybook/ComponentStateGallery";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { Input } from "./input";

const meta = {
  title: "Design system/Components/Input",
  component: Input,
  args: {
    "aria-label": "Repository filter",
    placeholder: "Filter repositories…",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const States: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <DesignSystemCanvas
      title="Input states"
      description="Persistent labels belong to form compositions; placeholders show examples or formats."
    >
      <ComponentStateGallery
        states={[
          {
            label: "Empty",
            content: <Input aria-label="Empty input" placeholder="Branch name…" />,
          },
          {
            label: "With value",
            content: <Input aria-label="Input with value" defaultValue="feature/design-system" />,
          },
          {
            label: "Disabled",
            content: <Input aria-label="Disabled input" disabled defaultValue="main" />,
          },
          {
            label: "Invalid",
            content: (
              <Input aria-label="Invalid input" aria-invalid defaultValue="invalid branch name" />
            ),
          },
        ]}
      />
    </DesignSystemCanvas>
  ),
};
