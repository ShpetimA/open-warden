import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeProvider } from "next-themes";

import { Markdown } from "./Markdown";

import body from "../../../tests/fixtures/github-review.md?raw";

const meta = {
  title: "Design system/Components/Markdown",
  component: Markdown,
  args: { children: body },
  decorators: [
    (Story, context) => (
      <ThemeProvider attribute="class" forcedTheme={context.globals.theme ?? "dark"}>
        <div className="bg-background text-foreground w-[min(800px,90vw)] p-4">
          <Story />
        </div>
      </ThemeProvider>
    ),
  ],
} satisfies Meta<typeof Markdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const GitHubReview: Story = {};
export const InvalidDiagram: Story = { args: { children: "```mermaid\ninvalid diagram\n```" } };
