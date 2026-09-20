import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDiff, FolderGit2, GitPullRequest, History, Link2 } from "lucide-react";
import { useState } from "react";

import { WorkspaceTabs, type WorkspaceTabItem } from "@/components/ui/workspace-tabs";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const initialTabs: readonly WorkspaceTabItem[] = [
  {
    id: "open-warden-changes",
    label: "open-warden",
    context: "Changes",
    icon: <FolderGit2 />,
    closable: false,
  },
  {
    id: "t3code-history",
    label: "t3code",
    context: "History",
    icon: <History />,
  },
  {
    id: "pull-request-418",
    label: "#418 Review navigation",
    context: "open-warden · Pull request",
    icon: <GitPullRequest />,
  },
];

function InteractiveWorkspaceTabs() {
  const [items, setItems] = useState(initialTabs);
  const [activeId, setActiveId] = useState(initialTabs[0]?.id ?? "");

  return (
    <WorkspaceTabs
      items={items}
      activeId={activeId}
      onActivate={setActiveId}
      onClose={(id) => {
        const closedIndex = items.findIndex((item) => item.id === id);
        const nextItems = items.filter((item) => item.id !== id);
        setItems(nextItems);
        if (id === activeId) {
          setActiveId(nextItems[closedIndex]?.id ?? nextItems[closedIndex - 1]?.id ?? "");
        }
      }}
      onAdd={() => undefined}
    />
  );
}

const meta = {
  title: "Design system/Components/Workspace Tabs",
  component: WorkspaceTabs,
  parameters: { layout: "fullscreen" },
  args: {
    items: initialTabs,
    activeId: initialTabs[0]?.id ?? "",
    onActivate: () => undefined,
  },
} satisfies Meta<typeof WorkspaceTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MixedResources: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Composable workspace tabs"
      description="Projects and pull requests can coexist. The active tab owns the visible workspace; ⌘K and the plus button open another resource."
    >
      <div className="overflow-hidden rounded-xl shadow-[var(--elevation-raised)] ring-1 ring-border">
        <InteractiveWorkspaceTabs />
        <div className="flex min-h-72 items-center justify-center bg-background p-8 text-sm text-muted-foreground">
          Active workspace content
        </div>
      </div>
    </DesignSystemCanvas>
  ),
};

export const AddMenu: Story = {
  render: () => {
    const [items, setItems] = useState(initialTabs);
    const [activeId, setActiveId] = useState(initialTabs[0]?.id ?? "");

    return (
      <WorkspaceTabs
        items={items}
        activeId={activeId}
        onActivate={setActiveId}
        onClose={(id) => {
          const closedIndex = items.findIndex((item) => item.id === id);
          const nextItems = items.filter((item) => item.id !== id);
          setItems(nextItems);
          if (id === activeId) {
            setActiveId(nextItems[closedIndex]?.id ?? nextItems[closedIndex - 1]?.id ?? "");
          }
        }}
        addLabel="Open a new tab"
        addItems={[
          { id: "pull-request", label: "Pull request", icon: <GitPullRequest />, shortcut: "P" },
          { id: "linked", label: "Linked pull requests", icon: <Link2 />, shortcut: "L" },
          { id: "history", label: "History", icon: <History />, shortcut: "T" },
          { id: "diff", label: "Diff", icon: <FileDiff />, shortcut: "D" },
        ]}
        onAddSelect={() => undefined}
      />
    );
  },
};

export const ProjectContexts: Story = {
  render: () => (
    <DesignSystemCanvas
      title="The same project in different contexts"
      description="The secondary label keeps project identity distinct from the feature currently open inside it."
    >
      <WorkspaceTabs
        items={[
          { id: "changes", label: "open-warden", context: "Changes", icon: <FileDiff /> },
          { id: "history", label: "open-warden", context: "History", icon: <History /> },
          {
            id: "pull-requests",
            label: "open-warden",
            context: "Pull requests",
            icon: <GitPullRequest />,
          },
        ]}
        activeId="history"
        onActivate={() => undefined}
        onClose={() => undefined}
        onAdd={() => undefined}
      />
    </DesignSystemCanvas>
  ),
};
