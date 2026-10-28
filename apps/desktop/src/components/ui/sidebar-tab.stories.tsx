import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowLeftRight, FileDiff, FolderOpen, GitPullRequest, History } from "lucide-react";
import { useState } from "react";

import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";
import SidebarTabButton from "./sidebar-tab";

const meta = {
  title: "Design system/Components/Sidebar Tab",
  component: SidebarTabButton,
  parameters: { layout: "fullscreen" },
  args: { isActive: false, label: "Changes", icon: <FileDiff />, onClick: () => {} },
} satisfies Meta<typeof SidebarTabButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const sections = [
  { label: "Changes", Icon: FileDiff },
  { label: "Repository files", Icon: FolderOpen },
  { label: "Pull Requests", Icon: GitPullRequest },
  { label: "History", Icon: History },
  { label: "Compare refs", Icon: ArrowLeftRight },
];

function RailExample() {
  const [active, setActive] = useState("Pull Requests");
  return (
    <DesignSystemCanvas
      title="Workspace navigation"
      description="Distinct silhouettes identify each section. The selected icon uses the accent color; hover reveals its full label."
    >
      <div className="border-border bg-surface flex h-72 max-w-lg overflow-hidden rounded-md border">
        <aside
          aria-label="Workspace sections"
          className="border-border bg-surface-toolbar flex w-14 shrink-0 flex-col items-center gap-1 border-r px-1.5 py-2"
        >
          {sections.map(({ label, Icon }) => (
            <SidebarTabButton
              key={label}
              label={label}
              icon={<Icon />}
              isActive={active === label}
              onClick={() => setActive(label)}
            />
          ))}
        </aside>
        <div className="flex flex-1 items-center justify-center text-sm">{active}</div>
      </div>
    </DesignSystemCanvas>
  );
}

export const WorkspaceRail: Story = { render: () => <RailExample /> };
