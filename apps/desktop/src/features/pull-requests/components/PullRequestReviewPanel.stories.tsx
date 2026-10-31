import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import type { CommentItem } from "@/features/source-control/types";
import type { ReviewDraft } from "@/platform/desktop/reviewDrafts";
import { PullRequestReviewPanelView } from "./PullRequestReviewPanel";

const meta = {
  title: "Pull requests/Review panel",
  parameters: { layout: "centered" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

function Example({ busy = false, error = false, empty = false }) {
  const [decision, setDecision] = useState<ReviewDraft["decision"]>("comment");
  const [message, setMessage] = useState("The validation looks good. One small question below.");

  const [comments, setComments] = useState<CommentItem[]>(
    empty
      ? []
      : [
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
        ],
  );

  return (
    <div className="w-[min(620px,calc(100vw-32px))]">
      <PullRequestReviewPanelView
        title="Validate invoice amounts before saving"
        number={114}
        decision={decision}
        message={message}
        pendingComments={comments}
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
        onRemoveComment={(id) => setComments((items) => items.filter((item) => item.id !== id))}
        onSubmit={() => {}}
        onClose={() => {}}
      />
    </div>
  );
}

export const Draft: Story = { render: () => <Example /> };
export const Submitting: Story = { render: () => <Example busy /> };
export const Retry: Story = { render: () => <Example error /> };

export const NoInlineComments: Story = { render: () => <Example empty /> };
