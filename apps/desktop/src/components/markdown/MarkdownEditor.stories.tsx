import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { MarkdownEditor } from "./MarkdownEditor";

const meta = {
  title: "Components/Markdown editor",
  parameters: { layout: "centered" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Example({ compact = false, width = 640, empty = false }) {
  const [value, setValue] = useState(
    empty
      ? ""
      : "Can we also test **zero amounts** before saving?\n\nThe existing validation looks good.",
  );

  return (
    <div className="max-w-[calc(100vw-32px)]" style={{ width }}>
      <MarkdownEditor value={value} onChange={setValue} compact={compact} />
    </div>
  );
}

export const Comment: Story = { render: () => <Example /> };
export const InlineComment: Story = { render: () => <Example compact /> };
export const Empty: Story = { render: () => <Example empty /> };
export const Narrow: Story = { render: () => <Example compact width={320} /> };
