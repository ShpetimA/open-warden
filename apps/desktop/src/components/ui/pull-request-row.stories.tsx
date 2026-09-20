import type { Meta, StoryObj } from "@storybook/react-vite";

import { PullRequestRow } from "@/components/ui/pull-request-row";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const meta = {
  title: "Design system/Components/Pull Request Row",
  component: PullRequestRow,
  parameters: { layout: "fullscreen" },
  args: {
    number: 418,
    title: "Add composable workspace tabs",
    author: "timi",
    sourceRef: "design-sys",
    targetRef: "main",
    updatedLabel: "12 min ago",
    additions: 284,
    deletions: 61,
  },
} satisfies Meta<typeof PullRequestRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const ListStates: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Pull-request rows"
      description="Dense two-line rows: title and branch identity carry the first line, diff size and recency anchor the right edge."
    >
      <div className="max-w-4xl flex-col gap-0.5">
        <PullRequestRow
          number={418}
          title="Add composable workspace tabs"
          author="timi"
          sourceRef="design-sys"
          targetRef="main"
          updatedLabel="12 min ago"
          additions={284}
          deletions={61}
          selected
        />
        <PullRequestRow
          number={416}
          title="Preserve Pierre navigation while filtering changed files"
          author="timi"
          sourceRef="pierre-filter"
          targetRef="main"
          updatedLabel="2 hr ago"
          additions={74}
          deletions={18}
        />
        <PullRequestRow
          number={409}
          title="Explore command-driven project navigation"
          author="timi"
          sourceRef="project-launcher"
          targetRef="main"
          updatedLabel="1 day ago"
          additions={31}
          deletions={4}
          draft
        />
        <PullRequestRow
          number={402}
          title="Trim preview scroll listeners"
          author="neo"
          sourceRef="scroll-listeners"
          targetRef="main"
          updatedLabel="3 days ago"
        />
      </div>
    </DesignSystemCanvas>
  ),
};
