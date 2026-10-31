import type { Meta, StoryObj } from "@storybook/react-vite";
import { GitCommitHorizontal, LoaderCircle, Plus } from "lucide-react";

import { ComponentStateGallery } from "@/design-system/storybook/ComponentStateGallery";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import { Button } from "./button";

const meta = {
  title: "Design system/Components/Button",
  component: Button,
  args: {
    children: "Create commit",
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <DesignSystemCanvas
      title="Button variants"
      description="Choose variants by semantic importance, not visual preference."
    >
      <ComponentStateGallery
        states={[
          { label: "Primary", content: <Button>Create commit</Button> },
          { label: "Secondary", content: <Button variant="secondary">Stage all</Button> },
          { label: "Outline", content: <Button variant="outline">Open repository</Button> },
          { label: "Ghost", content: <Button variant="ghost">Cancel</Button> },
          {
            label: "Toolbar",
            content: (
              <Button variant="toolbar" aria-label="Add repository" size="icon-sm">
                <Plus />
              </Button>
            ),
          },
          { label: "Destructive", content: <Button variant="destructive">Discard changes</Button> },
          { label: "Disabled", content: <Button disabled>Create commit</Button> },
          {
            label: "Leading icon",
            content: (
              <Button>
                <GitCommitHorizontal />
                Commit
              </Button>
            ),
          },
          {
            label: "Loading",
            content: (
              <Button disabled>
                <LoaderCircle className="animate-spin" />
                Committing
              </Button>
            ),
          },
          {
            label: "Icon only",
            content: (
              <Button aria-label="Add repository" size="icon">
                <Plus />
              </Button>
            ),
          },
        ]}
      />
    </DesignSystemCanvas>
  ),
};
