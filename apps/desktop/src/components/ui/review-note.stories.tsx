import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "./button";
import { ReviewNote } from "./review-note";

const meta = {
  title: "Design system/Components/Review Note",
  component: ReviewNote,
  parameters: { layout: "padded" },
  args: {
    title: "Reject invalid amounts at the boundary",
    label: "Review explanation",
    body: "- Negative amounts now stop before persistence.\n- **Zero stays valid.** Check both boundary cases in the regression tests.",
  },
} satisfies Meta<typeof ReviewNote>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Explanation: Story = {};
export const FocusedCodeNote: Story = {
  args: {
    body: "Reject negative amounts here; zero must remain valid.",
    details: {
      label: "Step details",
      body: "- The guard runs before persistence.\n- Confirm the failure response names the amount field.\n- Keep zero and positive values valid.",
    },
  },
};
export const ShortComment: Story = {
  args: {
    title: "Your comment",
    label: "Pending comment",
    body: "Testing",
    metadata: "Pending",
    actions: (
      <>
        <Button size="icon-xs" variant="ghost" aria-label="Edit draft">
          <Pencil />
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Delete draft">
          <Trash2 />
        </Button>
      </>
    ),
  },
};
export const LongComment: Story = {
  args: {
    title: "Your comment",
    label: "Pending comment",
    body: Array.from(
      { length: 12 },
      (_, index) =>
        `### Check ${index + 1}\n\nThe request should reject negative amounts before reaching the repository. Keep zero valid, and verify that the error identifies the amount field.\n\n- Retain the existing successful request behavior.\n- Cover the rejected request through the public API.`,
    ).join("\n\n"),
  },
};
export const Collapsed: Story = { args: { defaultCollapsed: true } };
