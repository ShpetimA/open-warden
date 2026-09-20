import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  FileDiff,
  FolderGit2,
  GitCommitHorizontal,
  GitPullRequest,
  History,
  Search,
} from "lucide-react";

import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { PullRequestRow } from "@/components/ui/pull-request-row";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";

const meta = {
  title: "Design system/Compositions/Workspace Navigation",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProjectAndPullRequestTabs: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Projects become composable workspaces"
      description="This direction removes project selection from the bottom edge. Global tabs retain open resources; project-local tabs switch features; Pierre remains the file-tree renderer."
    >
      <div className="overflow-hidden rounded-xl shadow-[var(--elevation-raised)] ring-1 ring-border">
        <WorkspaceTabs
          items={[
            {
              id: "open-warden",
              label: "open-warden",
              context: "Changes",
              icon: <FolderGit2 />,
              closable: false,
            },
            {
              id: "t3code",
              label: "t3code",
              context: "History",
              icon: <History />,
            },
            {
              id: "pr-418",
              label: "#418 Workspace tabs",
              context: "open-warden · Pull request",
              icon: <GitPullRequest />,
            },
          ]}
          activeId="open-warden"
          onActivate={() => undefined}
          onClose={() => undefined}
          onAdd={() => undefined}
        />
        <div className="bg-background min-h-96 p-4">
          <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">open-warden</h2>
              <div className="text-muted-foreground truncate font-mono text-xs">
                ~/proj/open-warden · design-sys
              </div>
            </div>
            <Kbd>⌘K</Kbd>
          </div>
          <Tabs defaultValue="changes">
            <TabsList aria-label="Open Warden project views">
              <TabsTrigger value="changes">
                <FileDiff /> Changes
              </TabsTrigger>
              <TabsTrigger value="history">
                <History /> History
              </TabsTrigger>
              <TabsTrigger value="pull-requests">
                <GitPullRequest /> Pull requests
              </TabsTrigger>
            </TabsList>
            <TabsContent value="changes" className="sr-only">
              Changes
            </TabsContent>
            <TabsContent value="history" className="sr-only">
              History
            </TabsContent>
            <TabsContent value="pull-requests" className="sr-only">
              Pull requests
            </TabsContent>
          </Tabs>
          <div className="mt-4 grid min-h-64 grid-cols-[18rem_minmax(0,1fr)] overflow-hidden rounded-lg ring-1 ring-border">
            <aside className="bg-surface border-r border-border/70 p-4">
              <div className="text-sm font-medium">Changed files</div>
              <p className="text-muted-foreground mt-2 text-xs leading-5 text-pretty">
                The existing Pierre tree renders in this owned scroll region. Storybook designs its
                surrounding toolbar and states, not a replacement tree.
              </p>
            </aside>
            <section className="flex items-center justify-center p-8 text-sm text-muted-foreground">
              Diff workspace
            </section>
          </div>
        </div>
      </div>
    </DesignSystemCanvas>
  ),
};

export const CommandLauncher: Story = {
  render: () => (
    <DesignSystemCanvas
      title="⌘K opens resources and actions"
      description="One command surface searches across projects, pull requests, history, files, and commands. Results name their resource type and context."
    >
      <div className="bg-popover mx-auto max-w-2xl overflow-hidden rounded-xl shadow-[var(--elevation-overlay)] ring-1 ring-border">
        <Command
          defaultValue="project-open-warden"
          className="[&_[cmdk-group-heading]]:text-foreground/70"
        >
          <CommandInput placeholder="Open a project, pull request, commit, file, or action…" />
          <CommandList className="max-h-none p-2">
            <CommandGroup heading="Projects">
              <CommandItem value="project-open-warden" className="min-h-11">
                <FolderGit2 />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">open-warden</span>
                  <span className="text-foreground/70 block truncate text-xs">
                    ~/proj/open-warden
                  </span>
                </span>
                <CommandShortcut className="text-foreground/70">Project</CommandShortcut>
              </CommandItem>
              <CommandItem value="project-t3code" className="min-h-11">
                <FolderGit2 />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">t3code</span>
                  <span className="text-foreground/70 block truncate text-xs">~/proj/t3code</span>
                </span>
                <CommandShortcut className="text-foreground/70">Project</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Pull requests and history">
              <CommandItem value="pr-418" className="min-h-11">
                <GitPullRequest />
                <span className="min-w-0 flex-1 truncate">#418 Add composable workspace tabs</span>
                <CommandShortcut className="text-foreground/70">open-warden</CommandShortcut>
              </CommandItem>
              <CommandItem value="commit-81add08f" className="min-h-11">
                <GitCommitHorizontal />
                <span className="min-w-0 flex-1 truncate">
                  81add08f feat(design-system): add workspace tabs
                </span>
                <CommandShortcut className="text-foreground/70">History</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="Actions">
              <CommandItem value="search-repository" className="min-h-10">
                <Search /> Search the active repository
                <CommandShortcut className="text-foreground/70">⌘⇧F</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </CommandList>
          <div className="text-foreground/70 flex min-h-10 items-center gap-3 border-t border-border/70 px-3 text-xs">
            <span className="flex items-center gap-1">
              <Kbd className="text-foreground/70">↑</Kbd>
              <Kbd className="text-foreground/70">↓</Kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd className="text-foreground/70">↵</Kbd> Open
            </span>
            <span className="ml-auto flex items-center gap-1">
              <Kbd className="text-foreground/70">Esc</Kbd> Close
            </span>
          </div>
        </Command>
      </div>
    </DesignSystemCanvas>
  ),
};

export const PullRequestWorkspaceList: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Pull requests are openable resources"
      description="The list is a discovery surface. Selecting previews a pull request; opening it creates or activates its workspace tab."
    >
      <div className="grid max-w-5xl grid-cols-[minmax(0,1fr)_18rem] overflow-hidden rounded-xl shadow-[var(--elevation-raised)] ring-1 ring-border">
        <div className="bg-background p-3">
          <div className="mb-3 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <input
                aria-label="Search pull requests"
                placeholder="Search pull requests"
                className="border-input bg-input h-10 w-full rounded-md border pr-3 pl-9 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              />
            </div>
            <Tabs defaultValue="open">
              <TabsList aria-label="Pull request state">
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="closed">Closed</TabsTrigger>
              </TabsList>
              <TabsContent value="open" className="sr-only">
                Open pull requests
              </TabsContent>
              <TabsContent value="closed" className="sr-only">
                Closed pull requests
              </TabsContent>
            </Tabs>
          </div>
          <div className="space-y-2">
            <PullRequestRow
              number={418}
              title="Add composable workspace tabs"
              author="timi"
              sourceRef="design-sys"
              targetRef="main"
              updatedLabel="12 min ago"
              additions={284}
              deletions={61}
              selected
            />
            <PullRequestRow
              number={416}
              title="Preserve Pierre navigation while filtering files"
              author="timi"
              sourceRef="pierre-filter"
              targetRef="main"
              updatedLabel="2 hr ago"
              additions={74}
              deletions={18}
            />
          </div>
        </div>
        <aside className="bg-surface border-l border-border/70 p-4">
          <div className="text-muted-foreground text-xs tabular-nums">#418 · open</div>
          <h2 className="mt-2 text-sm font-semibold text-balance">Add composable workspace tabs</h2>
          <p className="text-muted-foreground mt-3 text-xs leading-5 text-pretty">
            Preview metadata and review readiness before opening the pull request as its own tab.
          </p>
        </aside>
      </div>
    </DesignSystemCanvas>
  ),
};
