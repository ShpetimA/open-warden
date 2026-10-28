import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/markdown/Markdown";
import { ResizableSidebarLayout } from "./ResizableSidebarLayout";
import { SidebarPanelRegistryProvider, useSidebarPanelRegistry } from "./SidebarPanelRegistry";

const meta = {
  title: "Design system/Compositions/Resizable panes",
  component: ResizableSidebarLayout,
  args: { sidebar: null, content: null },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ResizableSidebarLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

const description = [
  "## Migrate the mobile app",
  "The complete pull request description stays in one scrollable pane.",
  ...Array.from(
    { length: 12 },
    (_, index) =>
      `### Validation ${index + 1}\n\nReview the application build, navigation, and device behavior. Long descriptions remain fully expanded as the pane is resized.`,
  ),
  "End of the full description.",
].join("\n\n");

function InboxPanes() {
  const { toggle } = useSidebarPanelRegistry();

  return (
    <div className="bg-surface-0 flex h-[650px] min-w-0 flex-col">
      <header className="flex gap-2 border-b p-2">
        <Button size="xs" variant="outline" onClick={() => toggle("inbox-list")}>
          Toggle list
        </Button>
        <Button size="xs" variant="outline" onClick={() => toggle("inbox-preview")}>
          Toggle preview
        </Button>
      </header>
      <div className="min-h-0 flex-1">
        <ResizableSidebarLayout
          panelId="inbox-list"
          contentPanelId="inbox-preview"
          sidebarDefaultSize={55}
          sidebarMinSize="360px"
          sidebarMaxSize={100}
          contentMinSize="280px"
          sidebar={
            <div className="h-full overflow-y-auto" aria-label="Pull request list">
              {Array.from({ length: 20 }, (_, index) => (
                <div key={index} className="border-b px-4 py-3 text-sm">
                  Pull request #{114 + index}
                </div>
              ))}
            </div>
          }
          content={
            <aside aria-label="Pull request preview" className="flex h-full min-w-0 flex-col">
              <header className="border-b px-5 py-4 text-sm font-semibold">
                Migrate the mobile app
              </header>
              <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
                <Markdown>{description}</Markdown>
              </div>
              <footer className="border-t p-3">
                <Button size="sm" className="w-full">
                  Open review
                </Button>
              </footer>
            </aside>
          }
        />
      </div>
    </div>
  );
}

export const Inbox: Story = {
  render: () => (
    <SidebarPanelRegistryProvider>
      <InboxPanes />
    </SidebarPanelRegistryProvider>
  ),
};
