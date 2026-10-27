import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { MemoryRouter } from "react-router";

import { ListLoadingState } from "@/components/ui/list-loading-state";
import { PullRequestReviewButton } from "@/features/pull-requests/components/PullRequestReviewControl";
import { FileList } from "@/features/source-control/components/FileList";
import { ReviewFileViewControl } from "@/features/source-control/components/ReviewFileViewControl";
import type { ReviewFileView } from "@/features/source-control/components/reviewFileGrouping";
import type { FileStatus } from "@/features/source-control/types";
import { PullRequestInboxFilters } from "./PullRequestInboxFilters";

const meta = {
  title: "Pull requests/Review browsing",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const files = [
  {
    path: "apps/hermes_gateway/src/hermes_gateway.erl",
    status: "modified",
    comments: 2,
    viewed: false,
  },
  { path: "apps/hermes_gateway/src/hermes_inbox.erl", status: "added", comments: 0, viewed: true },
  {
    path: "apps/hermes_gateway/test/hermes_gateway_test.erl",
    status: "added",
    comments: 1,
    viewed: false,
  },
  {
    path: "apps/hermes_gateway/test/hermes_inbox_test.erl",
    status: "added",
    comments: 0,
    viewed: true,
  },
  {
    path: "apps/rest_server/src/swagger_router.erl",
    status: "modified",
    comments: 0,
    viewed: false,
  },
  {
    path: "apps/rest_server/priv/api-docs/openapi.json",
    status: "modified",
    comments: 0,
    viewed: false,
  },
  { path: "docs/hermes_inbox.md", status: "added", comments: 0, viewed: true },
  { path: "pnpm-lock.yaml", status: "modified", comments: 0, viewed: false },
] satisfies Array<{ path: string; status: FileStatus; comments: number; viewed: boolean }>;

function GroupedFilesExample({
  compact = false,
  commitTitle,
}: {
  compact?: boolean;
  commitTitle?: string;
}) {
  const [view, setView] = useState<ReviewFileView>("review");
  const [selected, setSelected] = useState(files[0].path);
  return (
    <div className="bg-surface-toolbar flex h-[640px] w-[min(400px,100%)] flex-col border-r">
      <header className="flex items-center justify-between gap-2 border-b px-3 py-1">
        <span className="text-sm font-medium">Changed files</span>
        <ReviewFileViewControl
          value={view}
          onChange={setView}
          compact={compact}
          commitGrouping={
            commitTitle
              ? { selected: view === "review", onSelect: () => setView("review") }
              : undefined
          }
        />
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <FileList
          files={files}
          mode={view}
          reviewGroupTitle={commitTitle}
          selectedPath={selected}
          navRegion="review-browsing-story"
          onActivatePath={setSelected}
          getFileStatus={(file) => file.status}
          getCommentCount={(file) => file.comments}
          isViewed={(file) => file.viewed}
        />
      </div>
      <output
        aria-label="Selected file"
        className="break-words border-t p-3 text-xs text-muted-foreground"
      >
        {selected}
      </output>
    </div>
  );
}

export const FileGroups: Story = { render: () => <GroupedFilesExample /> };

export const CompactFileGroups: Story = { render: () => <GroupedFilesExample compact /> };

export const CommitFiles: Story = {
  render: () => <GroupedFilesExample compact commitTitle="OF-11384 Validate invoice exports" />,
};

export const ReviewActions: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-4 p-6">
      <PullRequestReviewButton onReview={() => {}} />
      <PullRequestReviewButton loading onReview={() => {}} />
      <PullRequestReviewButton
        disabledReason="Mark this pull request ready for review first"
        onReview={() => {}}
      />
    </div>
  ),
};

export const LoadingFiles: Story = {
  render: () => (
    <div className="bg-surface-toolbar h-[640px] w-[min(320px,100%)] border-r">
      <ListLoadingState label="Loading changed files…" />
    </div>
  ),
};

export const Filters: Story = {
  render: () => (
    <MemoryRouter initialEntries={["/pull-requests?involvement=review-requested&state=open"]}>
      <div className="px-6 py-3">
        <PullRequestInboxFilters
          authors={[
            { login: "shpetim_alimi", displayName: "Shpetim Alimi", avatarUrl: null },
            { login: "betim", displayName: "Betim Prevalla", avatarUrl: null },
          ]}
        />
      </div>
    </MemoryRouter>
  ),
};
