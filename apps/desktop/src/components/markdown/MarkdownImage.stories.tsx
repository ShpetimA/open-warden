import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownImage } from "./MarkdownImage";

const sample =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#334155"/><text x="600" y="310" text-anchor="middle" fill="white" font-size="48">Attachment preview</text></svg>',
  );
const meta = {
  title: "Design system/Components/Markdown image",
  component: MarkdownImage,
  args: { src: sample, alt: "Attached screenshot" },
  decorators: [
    (Story) => (
      <div className="bg-background text-foreground w-[min(480px,90vw)]">
        <Story />
        <p className="text-xs">Content stays in place below the preview.</p>
      </div>
    ),
  ],
} satisfies Meta<typeof MarkdownImage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const UnknownDimensions: Story = {};
export const KnownPortrait: Story = { args: { width: 200, height: 320 } };
export const Failed: Story = { args: { src: "data:image/png,unreadable" } };
export const LinkedPreview: Story = {
  render: (args) => (
    <a href={sample} target="_blank" rel="noreferrer">
      <MarkdownImage {...args} />
    </a>
  ),
};
