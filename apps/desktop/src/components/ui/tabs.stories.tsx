import type { Meta, StoryObj } from "@storybook/react-vite";
import { FileDiff, GitPullRequest, History } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const meta = {
  title: "Design system/Components/Tabs",
  component: Tabs,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectViews: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Project view tabs"
      description="Tabs switch peer views inside one project workspace. They do not replace Pierre or own repository state."
    >
      <Tabs defaultValue="changes" className="max-w-3xl">
        <TabsList aria-label="Project views">
          <TabsTrigger value="changes">
            <FileDiff /> Changes <span className="tabular-nums opacity-70">12</span>
          </TabsTrigger>
          <TabsTrigger value="history">
            <History /> History
          </TabsTrigger>
          <TabsTrigger value="pull-requests">
            <GitPullRequest /> Pull requests <span className="tabular-nums opacity-70">4</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="changes" className="mt-4 rounded-xl bg-surface p-5 ring-1 ring-border">
          Changes workspace chrome surrounds the existing Pierre-backed tree and diff canvas.
        </TabsContent>
        <TabsContent value="history" className="mt-4 rounded-xl bg-surface p-5 ring-1 ring-border">
          History search, commit list, comparison state, and diff canvas.
        </TabsContent>
        <TabsContent
          value="pull-requests"
          className="mt-4 rounded-xl bg-surface p-5 ring-1 ring-border"
        >
          Pull-request filters, list, and preview.
        </TabsContent>
      </Tabs>
    </DesignSystemCanvas>
  ),
};

export const ConstrainedWidth: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Tabs at narrow widths"
      description="The tab list keeps one stable row and becomes horizontally scrollable in its owning composition."
    >
      <div className="max-w-80 overflow-x-auto pb-2">
        <Tabs defaultValue="changes" className="w-max">
          <TabsList aria-label="Project views">
            <TabsTrigger value="changes">Changes</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
            <TabsTrigger value="pull-requests">Pull requests</TabsTrigger>
          </TabsList>
          <TabsContent value="changes" className="sr-only">
            Changes
          </TabsContent>
          <TabsContent value="history" className="sr-only">
            History
          </TabsContent>
          <TabsContent value="review" className="sr-only">
            Review
          </TabsContent>
          <TabsContent value="pull-requests" className="sr-only">
            Pull requests
          </TabsContent>
        </Tabs>
      </div>
    </DesignSystemCanvas>
  ),
};
