import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircle, CheckCircle2, CircleAlert, Info, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

import {
  InlineNotice,
  InlineNoticeAction,
  InlineNoticeContent,
  InlineNoticeDescription,
  InlineNoticeTitle,
} from "./inline-notice";

const meta = {
  title: "Design system/Components/Inline Notice",
  component: InlineNotice,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof InlineNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Inline notices"
      description="Notices explain transient system state without displacing the user's current workspace."
    >
      <div className="grid max-w-3xl gap-3">
        <InlineNotice>
          <Search />
          <InlineNoticeContent>
            <InlineNoticeTitle>No diagnostics reported</InlineNoticeTitle>
            <InlineNoticeDescription>
              The language server checked this file and found no issues.
            </InlineNoticeDescription>
          </InlineNoticeContent>
        </InlineNotice>
        <InlineNotice tone="info">
          <Info />
          <InlineNoticeContent>
            <InlineNoticeTitle>Review is local</InlineNoticeTitle>
            <InlineNoticeDescription>
              Comments remain on this machine until you publish the review.
            </InlineNoticeDescription>
          </InlineNoticeContent>
        </InlineNotice>
        <InlineNotice tone="success">
          <CheckCircle2 />
          <InlineNoticeContent>
            <InlineNoticeTitle>All checks passed</InlineNoticeTitle>
            <InlineNoticeDescription>
              12 required checks completed successfully.
            </InlineNoticeDescription>
          </InlineNoticeContent>
        </InlineNotice>
        <InlineNotice tone="warning">
          <CircleAlert />
          <InlineNoticeContent>
            <InlineNoticeTitle>3 pending comments</InlineNoticeTitle>
            <InlineNoticeDescription>
              Publish them together when the review is ready.
            </InlineNoticeDescription>
          </InlineNoticeContent>
          <InlineNoticeAction>
            <Button size="sm" variant="outline">
              Review
            </Button>
          </InlineNoticeAction>
        </InlineNotice>
        <InlineNotice tone="danger">
          <AlertCircle />
          <InlineNoticeContent>
            <InlineNoticeTitle>Diagnostics unavailable</InlineNoticeTitle>
            <InlineNoticeDescription>
              The language server exited before it finished checking this file.
            </InlineNoticeDescription>
          </InlineNoticeContent>
          <InlineNoticeAction>
            <Button size="sm" variant="outline">
              Retry
            </Button>
          </InlineNoticeAction>
        </InlineNotice>
      </div>
    </DesignSystemCanvas>
  ),
};
