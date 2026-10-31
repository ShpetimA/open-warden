import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { ReviewDraft } from "@/platform/desktop/reviewDrafts";
import { PullRequestReviewPanelView } from "./PullRequestReviewPanel";

const meta = {
  title: "Pull requests/Review panel",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ busy = false, error = false }) {
  const [decision, setDecision] = useState<ReviewDraft["decision"]>("comment");
  const [message, setMessage] = useState("The validation looks good. One small question below.");

  return (
    <div className="w-[min(620px,calc(100vw-32px))]">
      <PullRequestReviewPanelView
        title="Validate invoice amounts before saving"
        number={114}
        provider="bitbucket"
        decision={decision}
        message={message}
        pendingComments={[
          {
            type: "annotation",
            id: "note",
            repoPath: "/invoice",
            filePath: "src/invoice.ts",
            bucket: "unstaged",
            startLine: 3,
            endLine: 5,
            side: "additions",
            text: "Can we also test a zero amount?",
          },
        ]}
        busy={busy}
        canSubmit={!busy}
        error={
          error
            ? {
                operation: "submitPullRequestReview",
                code: "network",
                message: "Could not reach Bitbucket. Your draft is safe.",
              }
            : undefined
        }
        onDecision={setDecision}
        onMessage={setMessage}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    </div>
  );
}

export const Draft: Story = { render: () => <Example /> };
export const Submitting: Story = { render: () => <Example busy /> };
export const Retry: Story = { render: () => <Example error /> };
