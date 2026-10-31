import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  ChevronRight,
  CircleDot,
  FolderClosed,
  GitPullRequestArrow,
  History,
  MessageSquare,
  PanelLeft,
  Rows3,
  RotateCw,
  Search,
  Settings,
  WrapText,
} from "lucide-react";
import type { ReactNode } from "react";

import { DiffStat } from "@/components/ui/diff-stat";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DesignSystemCanvas } from "@/design-system/storybook/DesignSystemCanvas";
import { cn } from "@/lib/utils";

const meta = {
  title: "Design system/Compositions/Project Workspaces",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function TrafficLights() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="size-3 rounded-full bg-[oklch(0.65_0.24_26)]" />
      <span className="size-3 rounded-full bg-[oklch(0.8_0.17_88)]" />
      <span className="size-3 rounded-full bg-[oklch(0.75_0.18_150)]" />
    </div>
  );
}

function ToolbarIconButton({
  label,
  children,
  active,
}: {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "focus-visible:ring-ring/60 flex size-7 items-center justify-center rounded-md outline-none transition-[background-color,color] focus-visible:ring-2",
        active
          ? "bg-surface-elevated text-foreground shadow-xs ring-1 ring-border/60"
          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AppWindow({
  navTabs,
  activeTab,
  onTab,
  sidebar,
  sidebarRail,
  children,
}: {
  navTabs: ReadonlyArray<{ id: string; label: string; icon: ReactNode; count?: number }>;
  activeTab: string;
  onTab?: (id: string) => void;
  sidebar: ReactNode;
  sidebarRail: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl shadow-[var(--elevation-raised)] ring-1 ring-border">
      <div className="flex h-9 items-center gap-3 bg-surface-toolbar px-3">
        <TrafficLights />
        <div className="flex items-center gap-1">
          <ToolbarIconButton label="Toggle sidebar">
            <PanelLeft className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Toggle rail">
            <Rows3 className="size-3.5" />
          </ToolbarIconButton>
        </div>
        <div className="flex min-w-0 flex-1 justify-center">
          <Tabs value={activeTab} onValueChange={onTab}>
            <TabsList aria-label="Project views" className="bg-surface-alt/60">
              {navTabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="h-5.5 px-2.5">
                  {tab.icon}
                  {tab.label}
                  {tab.count !== undefined ? (
                    <span className="pl-1 text-[10px] tabular-nums text-muted-foreground">
                      {tab.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarIconButton label="Refresh">
            <RotateCw className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Stage behavior">
            <GitPullRequestArrow className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Search">
            <Search className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Settings">
            <Settings className="size-3.5" />
          </ToolbarIconButton>
        </div>
      </div>
      <div className="flex min-h-96 bg-background" style={{ height: "44rem" }}>
        <aside
          data-slot="sidebar-rail"
          className="bg-surface-toolbar border-border/70 flex w-10 shrink-0 flex-col items-center gap-1 border-r px-1.5 py-2"
        >
          {sidebarRail}
        </aside>
        <div data-slot="project-sidebar" className="flex w-64 shrink-0 flex-col">
          {sidebar}
        </div>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}

function RepoHeader({ branch }: { branch?: string }) {
  return (
    <div className="border-border/70 flex min-h-10 items-center justify-between gap-2 border-b px-3 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-[13px] font-medium">marketplace_bo_fe</div>
        {branch ? (
          <div className="text-muted-foreground flex items-center gap-1 truncate text-[11px]">
            <GitPullRequestArrow className="size-3" />
            {branch}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <ToolbarIconButton label="Choose repository">
          <FolderClosed className="size-3.5" />
        </ToolbarIconButton>
        <ToolbarIconButton label="Refresh repository">
          <RotateCw className="size-3.5" />
        </ToolbarIconButton>
      </div>
    </div>
  );
}

const stagedRows: ReadonlyArray<{
  depth: number;
  name: string;
  icon?: ReactNode;
  status?: string;
}> = [
  { depth: 0, name: "app", status: "•" },
  { depth: 1, name: "components", status: "•" },
  { depth: 2, name: "products", status: "•" },
  { depth: 2, name: "product-detail.tsx", status: "M" },
  { depth: 2, name: "product-lifecycle-actions.tsx", status: "M" },
];

function OutlineRow({
  depth,
  name,
  status,
  active,
}: {
  depth: number;
  name: string;
  status?: string;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-h-6.5 items-center gap-1 rounded-md pr-2",
        active ? "bg-surface-active" : "hover:bg-accent/50",
      )}
      style={{ paddingLeft: `${8 + depth * 12}px` }}
    >
      <span
        className={cn(
          "min-w-0 truncate font-mono text-[11.5px]",
          status === "M" ? "font-medium" : "",
        )}
      >
        {name}
      </span>
      <span
        className={cn(
          "ml-auto shrink-0 font-mono text-[10px] tabular-nums",
          status === "M"
            ? "text-diff-modification"
            : status === "A"
              ? "text-diff-addition"
              : "text-muted-foreground/60",
        )}
      >
        {status}
      </span>
    </div>
  );
}

export const ChangesWorkspace: Story = {
  render: () => (
    <DesignSystemCanvas
      title="Changes workspace"
      description="Slim top navigation, a source-control rail, and one sidebar that owns staging, the commit box, and the changed-files outline. The diff stage stays empty until a file is selected."
    >
      <AppWindow
        activeTab="changes"
        navTabs={[
          { id: "changes", label: "Changes", icon: <GitPullRequestArrow className="size-3.5" /> },
          { id: "prs", label: "Pull Requests", icon: <GitPullRequestArrow className="size-3.5" /> },
          { id: "history", label: "History", icon: <History className="size-3.5" /> },
          { id: "review", label: "Review", icon: <GitPullRequestArrow className="size-3.5" /> },
        ]}
        sidebarRail={
          <>
            <ToolbarIconButton label="Source control view">
              <GitPullRequestArrow className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton label="Repository files">
              <FolderClosed className="size-4" />
            </ToolbarIconButton>
          </>
        }
        sidebar={
          <>
            <RepoHeader branch="main" />
            <div className="flex flex-col gap-2 px-3 py-3">
              <input
                aria-label="Commit message"
                placeholder="Message (⌘↵ to commit)"
                className="border-input bg-input focus-visible:ring-ring/50 h-8 w-full rounded-md border px-2.5 text-[13px] outline-none transition-[border-color,box-shadow] focus-visible:ring-2"
              />
              <button
                type="button"
                className="focus-visible:ring-ring/50 flex h-8 items-center justify-center gap-1.5 rounded-md text-[13px] font-medium text-white outline-none transition-[background-color,box-shadow] focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
                style={{ backgroundColor: "var(--destructive)" }}
              >
                Commit to <code className="font-mono text-xs">main</code>
              </button>
            </div>
            <div className="border-border/70 min-h-0 flex-1 overflow-y-auto border-t px-1.5 py-1.5">
              <div className="flex items-center gap-1 px-1.5 pb-1">
                <span className="text-foreground/85 text-xs font-semibold">Staged Changes</span>
                <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">9</span>
                <span className="text-primary ml-0.5 size-2 shrink-0 rounded-full" />
              </div>
              {stagedRows.map((row, index) => (
                <OutlineRow
                  key={`${row.name}-${index}`}
                  depth={row.depth}
                  name={row.name}
                  status={row.status}
                  active={row.name === "product-detail.tsx"}
                />
              ))}
              <div className="mt-3 flex items-center gap-1 border-border/70 px-1.5 pb-1 pt-2">
                <span className="text-foreground/85 text-xs font-semibold">Changes</span>
                <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">2</span>
                <span className="text-primary ml-0.5 size-2 shrink-0 rounded-full" />
              </div>
              <OutlineRow depth={0} name="RootRouter.tsx" status="M" />
              <OutlineRow depth={0} name="openapi.json" status="M" />
            </div>
          </>
        }
      >
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Select a file to view diff.
        </div>
      </AppWindow>
    </DesignSystemCanvas>
  ),
};

const commits = [
  {
    summary: "feat: refine merchant product workflows",
    shortId: "468d67f",
    author: "Shpetim",
    relativeTime: "4 weeks ago",
    active: true,
  },
  {
    summary: "feat: add marketplace review and lifecycle actions",
    shortId: "80198d9",
    author: "Shpetim",
    relativeTime: "4 weeks ago",
  },
  {
    summary: "Update product details endpoint",
    shortId: "cf07a27",
    author: "Shpetim",
    relativeTime: "4 weeks ago",
  },
  {
    summary: "Merged in bo-ui (pull request #1)",
    shortId: "136b7ef",
    author: "Shpetim Alimi",
    relativeTime: "5 weeks ago",
  },
  {
    summary: "build: restore S3 CloudFront deployment",
    shortId: "8ec7ddd",
    author: "Shpetim",
    relativeTime: "5 weeks ago",
  },
];

function CommitRow({
  summary,
  shortId,
  author,
  relativeTime,
  active,
}: {
  summary: string;
  shortId: string;
  author: string;
  relativeTime: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      data-active={active || undefined}
      className={cn(
        "block w-full rounded-md px-2 py-2 text-left outline-none transition-[background-color] focus-visible:ring-2 focus-visible:ring-ring/50",
        active ? "bg-surface-active" : "hover:bg-accent/60",
      )}
    >
      <span className="block truncate text-[13px] font-medium">{summary}</span>
      <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px] tabular-nums">
        <code className="bg-surface-alt shrink-0 rounded px-1.5 py-0.5">{shortId}</code>
        <span className="min-w-0 flex-1 truncate">{author}</span>
        <span className="shrink-0">{relativeTime}</span>
      </span>
    </button>
  );
}

function CommitFilesTree() {
  return (
    <div className="border-border/70 flex w-72 max-w-72 shrink-0 flex-col border-l">
      <div className="border-border/70 flex min-h-10 flex-col justify-center gap-0.5 border-b px-3 py-1.5">
        <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.1em] uppercase">
          Commit files
        </div>
        <div className="text-muted-foreground text-[11px] tabular-nums">468d67f · 3 files</div>
      </div>
      <div className="px-1.5 py-1.5">
        <OutlineRow depth={0} name="app" status="•" />
        <div className="border-line/0 flex">
          <div className="border-border/70 ml-10 mr-1 w-px shrink-0 border-l" />
          <div className="min-w-0 flex-1">
            <OutlineRow depth={-1} name="components / products" status="•" />
            <OutlineRow depth={0} name="product-detail.tsx" status="M" active />
            <OutlineRow depth={0} name="product-lifecycle-actions.tsx" status="M" />
            <OutlineRow depth={-1} name="routes" status="•" />
            <OutlineRow depth={0} name="merchant-product-edit.tsx" status="M" />
          </div>
        </div>
      </div>
    </div>
  );
}

const diffLines = [
  { no: "205", code: "      </TabsTrigger>" },
  { no: "206", code: "      )}}" },
  { no: "207", code: "    </TabsList>" },
  { no: "208", code: '    <TabsContent value={product.record_state} className="gap-6">' },
  {
    no: "209",
    code: '      {lifecycleActions === "visible" && (',
    kind: "del" as const,
    newNo: "209",
  },
  {
    no: "209",
    code: '      {lifecycleActions === "visible" && product.record_state !== "R" && (',
    kind: "add" as const,
  },
  { no: "210", code: "        <Card>" },
  { no: "211", code: '          <CardHeader className="border-b">' },
  { no: "213", code: "            Lifecycle actions" },
  { no: "215", code: "          </CardDescription>" },
  {
    no: "216",
    code: "            Review the current status and approve, reject, or remove this",
    kind: "del" as const,
  },
  { no: "217", code: "              product.", kind: "del" as const },
  { no: "216", code: '              {product.record_state === "I"', kind: "add" as const },
  {
    no: "217",
    code: '                ? "Approve or reject the submitted changes."',
    kind: "add" as const,
  },
  {
    no: "218",
    code: '                : "This is the approved product customers can see."',
    kind: "add" as const,
  },
  { no: "219", code: "          </CardDescription>" },
];

function DiffStage() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="border-border/70 flex min-h-10 items-center gap-2 border-b px-3 py-1.5">
        <ToolbarIconButton label="Focus file" active>
          <Search className="size-3" />
        </ToolbarIconButton>
        <span className="text-foreground/90 min-w-0 truncate font-mono text-xs">
          app/components/products/product-detail.tsx
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="flex items-center gap-1.5">
            <DiffStat kind="deletion" value={3} />
            <DiffStat kind="addition" value={5} />
          </span>
          <ToolbarIconButton label="Split view">
            <Rows3 className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Wrap lines">
            <WrapText className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Comments">
            <MessageSquare className="size-3.5" />
          </ToolbarIconButton>
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-surface">
        <div className="border-border/70 flex items-center gap-2 border-b bg-surface-toolbar px-3 py-1 text-[11px] text-muted-foreground">
          <ChevronRight className="size-3" /> 204 unmodified lines
        </div>
        {diffLines.map((line, index) => (
          <div
            key={`${line.no}-${index}`}
            className={cn(
              "flex items-start gap-3 px-3 font-mono text-[12px] leading-5 whitespace-nowrap",
              line.kind === "del" && "bg-diff-deletion-surface text-diff-deletion",
              line.kind === "add" && "bg-diff-addition-surface text-diff-addition",
            )}
          >
            <span className="text-muted-foreground/70 w-8 shrink-0 text-right tabular-nums">
              {line.no}
            </span>
            <span className="min-w-0 truncate">{line.code}</span>
          </div>
        ))}
        <div className="border-border/70 flex items-center gap-2 border-y bg-surface-toolbar px-3 py-1 text-[11px] text-muted-foreground">
          <CircleDot className="size-3" /> 5 unmodified lines
        </div>
        {diffLines.slice(0, 4).map((line, index) => (
          <div
            key={`tail-${index}`}
            className="flex gap-3 px-3 font-mono text-[12px] leading-5 whitespace-nowrap"
          >
            <span className="text-muted-foreground/70 w-8 shrink-0 text-right tabular-nums">
              {line.no}
            </span>
            <span className="min-w-0 truncate">{line.code}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const HistoryWorkspace: Story = {
  render: () => (
    <DesignSystemCanvas
      title="History workspace"
      description="The left sidebar owns commit triage (filter, count, compare selection). The middle rail lists the selected commit's files as an outline. The right stage keeps header, actions, and diff."
    >
      <AppWindow
        activeTab="history"
        navTabs={[
          { id: "changes", label: "Changes", icon: <GitPullRequestArrow className="size-3.5" /> },
          { id: "prs", label: "Pull Requests", icon: <GitPullRequestArrow className="size-3.5" /> },
          { id: "history", label: "History", icon: <History className="size-3.5" /> },
          { id: "review", label: "Review", icon: <GitPullRequestArrow className="size-3.5" /> },
        ]}
        sidebarRail={
          <>
            <ToolbarIconButton label="Source control view">
              <GitPullRequestArrow className="size-4" />
            </ToolbarIconButton>
            <ToolbarIconButton label="Repository files">
              <FolderClosed className="size-4" />
            </ToolbarIconButton>
          </>
        }
        sidebar={
          <div className="flex min-h-0 flex-1 flex-col">
            <RepoHeader />
            <div className="border-border/70 border-b px-3 py-2">
              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                <Input
                  aria-label="Filter commits"
                  placeholder="Filter commits (msg, id, author)"
                  className="h-8 pl-8 text-[13px]"
                />
              </div>
              <div className="text-muted-foreground mt-1.5 flex items-center gap-1 text-[11px] tabular-nums">
                41 / 41 commits
                <span className="ml-auto">
                  <Kbd>/</Kbd>
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
              {commits.map((commit) => (
                <CommitRow key={commit.shortId} {...commit} />
              ))}
            </div>
          </div>
        }
      >
        <div className="flex min-h-0 flex-1">
          <CommitFilesTree />
          <DiffStage />
        </div>
      </AppWindow>
    </DesignSystemCanvas>
  ),
};
