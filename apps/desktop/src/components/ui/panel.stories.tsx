import type { Meta, StoryObj } from "@storybook/react-vite";
import { Filter, MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FileChangeRow } from "@/components/ui/file-change-row";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import {
  Panel,
  PanelActions,
  PanelBody,
  PanelDescription,
  PanelFooter,
  PanelHeader,
  PanelHeading,
  PanelTitle,
} from "./panel";

const meta = {
  title: "Design system/Components/Panel",
  component: Panel,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Panel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FileWorkspace: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Panels"
      description="A panel owns its header, bounded content region, and optional footer. Dividers explain structure; the outer shadow defines the surface."
    >
      <Panel className="h-[32rem] w-[24rem]">
        <PanelHeader>
          <PanelHeading>
            <PanelTitle>Changes</PanelTitle>
            <PanelDescription>feature/design-system · 6 files</PanelDescription>
          </PanelHeading>
          <PanelActions>
            <Button aria-label="Filter changed files" size="icon-lg" variant="ghost">
              <Filter />
            </Button>
            <Button aria-label="More change actions" size="icon-lg" variant="ghost">
              <MoreHorizontal />
            </Button>
          </PanelActions>
        </PanelHeader>
        <PanelBody className="space-y-0.5 overflow-y-auto p-1.5">
          <FileChangeRow path="src/components/ui/status-badge.tsx" status="added" additions={74} />
          <FileChangeRow
            path="src/components/ui/panel.tsx"
            status="modified"
            additions={28}
            deletions={6}
            selected
          />
          <FileChangeRow
            path="src/features/review/ReviewPanel.tsx"
            status="modified"
            additions={18}
            deletions={11}
            commentCount={3}
          />
          <FileChangeRow path="src/legacy/OldStatus.tsx" status="deleted" deletions={42} />
          <FileChangeRow
            path="src/app/theme.ts"
            previousPath="src/app/colors.ts"
            status="renamed"
            additions={3}
            deletions={2}
          />
          <FileChangeRow path="src/features/source-control/conflicts.ts" status="conflicted" />
        </PanelBody>
        <PanelFooter>
          <span className="text-muted-foreground flex-1 text-xs tabular-nums">+123 −61</span>
          <Button size="sm">
            <Plus />
            Stage all
          </Button>
        </PanelFooter>
      </Panel>
    </DesignSystemCanvas>
  ),
};
