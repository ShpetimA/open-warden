import { parseDiffFromFile, type ThemeTypes } from "@pierre/diffs";
import { FileDiff as PierreFileDiff, Virtualizer } from "@pierre/diffs/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CheckSquare,
  FolderClosed,
  GitPullRequest,
  GitPullRequestArrow,
  PanelLeftClose,
  Plus,
  RotateCw,
  Search,
  Settings,
  WrapText,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { PullRequestRow } from "@/components/ui/pull-request-row";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceTabs,
  type WorkspaceAddItem,
  type WorkspaceTabItem,
} from "@/components/ui/workspace-tabs";
import { cn } from "@/lib/utils";
import { buildPierreGitStatusEntries } from "@/features/source-control/components/pierreFileTree";
import { PierreFileTreeBrowser } from "@/features/source-control/components/PierreFileTreeBrowser";

const meta = {
  title: "Design system/Compositions/Workspace Shell",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const PRODUCT_PATH = "app/components/products/product-detail.tsx";
const ROUTES_PATH = "app/routes/merchant-product-edit.tsx";

function padFollower(lines: readonly string[]) {
  return lines.join("\n").split("\n");
}

const productHead = padFollower([
  'import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";',
  "",
  "type ProductDetailProps = {",
  "  product: Product;",
  "};",
  "",
  "export function ProductDetail({ product }: ProductDetailProps) {",
  "  return (",
  '    <Tabs defaultValue="details">',
  '      <TabsList className="gap-6">',
  '        <TabsTrigger value="details">',
  "          Details",
  "        </TabsTrigger>",
  '        <TabsTrigger value="inventory">',
  "          Inventory",
  "        </TabsTrigger>",
  "      </TabsList>",
  '      <TabsContent value="details" className="gap-6">',
  "        <Card>",
  '          <CardHeader className="border-b">',
  '            <CardTitle aria-level={2} role="heading">',
  "              Product details",
  "            </CardTitle>",
  "            <CardDescription>",
  "              Review the current status and approve, reject, or remove this",
  "              product.",
  "            </CardDescription>",
  "            <CardAction>",
  "              <Badge",
  "                aria-label={`Product status: ${stateLabel[product.record_state]}`}",
  "              >",
  "                {stateLabel[product.record_state]}",
  "              </Badge>",
  "            </CardAction>",
  "          </CardHeader>",
  "          <CardContent>",
  "            <ProductLifecycleActions",
  "              accountNumber={accountNumber}",
  "              key={product.record_state}",
  "              onComplete={(action) => {",
  '                if (action === "delete") {',
  "                  onDeleted?.()",
  "                  return",
  "                }",
  "              }}",
  "            />",
  "          </CardContent>",
  "        </Card>",
  "      </TabsContent>",
  "    </Tabs>",
  "  );",
  "}",
]);

const productOld = productHead.join("\n");
const productNew = padFollower([
  'import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";',
  "",
  "type ProductDetailProps = {",
  "  product: Product;",
  "};",
  "",
  "export function ProductDetail({ product }: ProductDetailProps) {",
  "  return (",
  '    <Tabs defaultValue="details">',
  '      <TabsList className="gap-6">',
  '        <TabsTrigger value="details">',
  "          Details",
  "        </TabsTrigger>",
  '        <TabsTrigger value="inventory">',
  "          Inventory",
  "        </TabsTrigger>",
  "      </TabsList>",
  '      <TabsContent value={product.record_state} className="gap-6">',
  "        <Card>",
  '          <CardHeader className="border-b">',
  '            <CardTitle aria-level={2} role="heading">',
  "              Product details",
  "            </CardTitle>",
  "            <CardDescription>",
  '              {product.record_state === "I"',
  '                ? "Approve or reject the submitted changes. The live product stays unchanged until approved."',
  '                : "This is the approved product customers can see. Deleting it permanently removes it."}',
  "            </CardDescription>",
  "            <CardAction>",
  "              <Badge",
  "                aria-label={`Product status: ${stateLabel[product.record_state]}`}",
  "              >",
  "                {stateLabel[product.record_state]}",
  "              </Badge>",
  "            </CardAction>",
  "          </CardHeader>",
  "          <CardContent>",
  "            <ProductLifecycleActions",
  "              accountNumber={accountNumber}",
  "              key={product.record_state}",
  "              onComplete={(action) => {",
  '                if (action === "delete") {',
  "                  onDeleted?.()",
  "                  return",
  "                }",
  "              }}",
  "            />",
  "          </CardContent>",
  "        </Card>",
  "      </TabsContent>",
  "    </Tabs>",
  "  );",
  "}",
]).join("\n");

const routesOld = padFollower([
  'import { Form } from "react-router";',
  'import { useProductLoader } from "@/hooks/useProductLoader";',
  "",
  "export default function MerchantProductEdit() {",
  "  return useProductLoader(() => { return (",
  '    <Form method="post">',
  "      <ProductWorkflow",
  '        mode="edit"',
  "      />",
  "    </Form>",
  "  ); });",
  "}",
]).join("\n");

const routesNew = padFollower([
  'import { Form } from "react-router";',
  'import { useProductLoader } from "@/hooks/useProductLoader";',
  "",
  "export default function MerchantProductEdit() {",
  "  const product = useProductLoader();",
  '  const canEdit = product.record_state !== "D";',
  "  return (",
  '    <Form method="post">',
  "      <PrepareForm",
  '        mode="edit"',
  "        readOnly={!canEdit}",
  "      />",
  "    </Form>",
  "  );",
  "}",
]).join("\n");

const diffInputs = new Map<string, { oldText: string; newText: string }>([
  [PRODUCT_PATH, { oldText: productOld, newText: productNew }],
  [ROUTES_PATH, { oldText: routesOld, newText: routesNew }],
]);

const changedFiles: ReadonlyArray<{ path: string; status: "modified" | "added" }> = [
  { path: PRODUCT_PATH, status: "modified" },
  { path: ROUTES_PATH, status: "modified" },
  { path: "app/features/marketplace-admin/marketplace-admin.schema.ts", status: "modified" },
  { path: "openapi.json", status: "modified" },
];

function useDiffTheme(): ThemeTypes {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributeFilter: ["class"], attributes: true });
      return () => observer.disconnect();
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "dark",
  );
}

const STORY_DIFF_CSS = `
[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--diffs-bg);
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
}
`;

function ToolbarIconButton({
  label,
  children,
  active,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/60 flex size-7 shrink-0 items-center justify-center rounded-md outline-none transition-[background-color,color] focus-visible:ring-2",
        active
          ? "bg-surface-elevated text-foreground shadow-xs ring-1 ring-border/60"
          : "text-muted-foreground hover:bg-accent/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

const projectNavTabs = [
  { id: "changes", label: "Changes", icon: <GitPullRequestArrow className="size-3.5" /> },
  { id: "prs", label: "Pull Requests", icon: <GitPullRequest className="size-3.5" /> },
];

function DiffStage({ activePath }: { activePath: string }) {
  const themeType = useDiffTheme();
  const fileDiff = useMemo(() => {
    const inputs = diffInputs.get(activePath);
    if (!inputs) return null;
    return parseDiffFromFile(
      { name: activePath, contents: inputs.oldText },
      { name: activePath, contents: inputs.newText },
    );
  }, [activePath]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      <div className="border-border/70 flex min-h-9 items-center gap-2 border-b px-3 py-1">
        <div className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/90">
          {activePath}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIconButton label="Wrap lines">
            <WrapText className="size-3.5" />
          </ToolbarIconButton>
          <ToolbarIconButton label="Search in diff">
            <Search className="size-3.5" />
          </ToolbarIconButton>
        </div>
      </div>
      {fileDiff ? (
        <Virtualizer
          config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}
          className="diff-viewport-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        >
          <PierreFileDiff
            className="block min-w-0 max-w-full"
            fileDiff={fileDiff}
            options={{
              diffStyle: "unified",
              theme: { dark: "github-dark", light: "github-light" },
              themeType,
              unsafeCSS: STORY_DIFF_CSS,
            }}
          />
        </Virtualizer>
      ) : (
        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          Select a file to view diff.
        </div>
      )}
    </div>
  );
}

function LandingContent({ openPullRequests }: { openPullRequests: () => void }) {
  const items = [
    { key: "search", label: "Search repositories", icon: <Search /> },
    { key: "prs", label: "Pull requests", icon: <GitPullRequest /> },
    { key: "repos", label: "Open repository", icon: <FolderClosed /> },
    { key: "settings", label: "Settings", icon: <Settings /> },
  ];

  return (
    <div className="mx-auto w-full max-w-xl px-10 py-14">
      <h1 className="text-xl font-semibold">New tab</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Start something new or return to recent work.
      </p>
      <div className="text-muted-foreground mt-9 text-[11px] font-semibold tracking-[0.1em]">
        OPEN
      </div>
      <div className="mt-1.5">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={item.key === "prs" ? openPullRequests : undefined}
            className="focus-visible:ring-ring/50 -mx-2 flex min-h-8 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2"
          >
            <span aria-hidden="true" className="text-muted-foreground [&>svg]:size-3.5">
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
      <div className="text-muted-foreground mt-9 text-[11px] font-semibold tracking-[0.1em]">
        RECENT PROJECTS
      </div>
      <div className="mt-1.5">
        {[
          { name: "marketplace_bo_fe", ago: "28m ago" },
          { name: "invoice-service", ago: "2h ago" },
          { name: "bo-ui", ago: "6h ago" },
        ].map((project) => (
          <button
            key={project.name}
            type="button"
            className="focus-visible:ring-ring/50 -mx-2 flex min-h-8 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 text-left text-sm outline-none hover:bg-accent/60 focus-visible:ring-2"
          >
            <span className="bg-foreground/15 size-2 shrink-0 rounded-full" aria-hidden="true" />
            <span className="truncate">{project.name}</span>
            <span className="text-muted-foreground ml-auto text-[11px] tabular-nums">
              {project.ago}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PullRequestHost() {
  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="min-w-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
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
            title="Preserve Pierre navigation while filtering changed files"
            author="timi"
            sourceRef="pierre-filter"
            targetRef="main"
            updatedLabel="2 hr ago"
            additions={74}
            deletions={18}
          />
          <PullRequestRow
            number={409}
            title="Explore command-driven project navigation"
            author="neo"
            sourceRef="project-launcher"
            targetRef="main"
            updatedLabel="1 day ago"
            additions={31}
            deletions={4}
            draft
          />
        </div>
      </div>
      <aside className="bg-surface border-border/70 w-64 shrink-0 border-l px-4 py-3">
        <div className="text-muted-foreground text-[11px] tabular-nums">#418 · open</div>
        <h2 className="mt-1.5 text-sm font-semibold">Add composable workspace tabs</h2>
        <p className="text-muted-foreground mt-3 text-xs leading-5 text-pretty">
          Preview metadata and review readiness before opening the pull request as its own tab.
        </p>
      </aside>
    </div>
  );
}

function ShellDemo() {
  const [tabs, setTabs] = useState<WorkspaceTabItem[]>([
    {
      id: "marketplace",
      label: "marketplace_bo_fe",
      context: "Changes",
      icon: <GitPullRequestArrow className="size-3.5" />,
      closable: false,
    },
    {
      id: "bo-ui",
      label: "bo-ui",
      context: "Pull request #41",
      icon: <GitPullRequest className="size-3.5" />,
    },
  ]);
  const [activeId, setActiveId] = useState("marketplace");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectView, setProjectView] = useState("changes");
  const [activePath, setActivePath] = useState(PRODUCT_PATH);

  const gitStatus = buildPierreGitStatusEntries(
    changedFiles,
    (file) => file.path,
    (file) => file.status,
  );

  const addItems: readonly WorkspaceAddItem[] = [
    { id: "pull-requests", label: "Pull requests", icon: <GitPullRequest />, shortcut: "P" },
    { id: "new-tab", label: "New tab", icon: <Plus />, shortcut: "T" },
  ];

  const openProjectWorkspace = activeId === "new-tab" || activeId === "pull-requests";

  return (
    <div className="overflow-hidden rounded-xl shadow-[var(--elevation-raised)] ring-1 ring-border">
      <div className="bg-surface-toolbar border-border/70 flex h-9 items-center gap-2 border-b px-2.5">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="size-3 rounded-full bg-[oklch(0.65_0.24_26)]" />
          <span className="size-3 rounded-full bg-[oklch(0.8_0.17_88)]" />
          <span className="size-3 rounded-full bg-[oklch(0.75_0.18_150)]" />
        </div>
        <div className="min-w-0 flex-1">
          <WorkspaceTabs
            items={tabs}
            activeId={activeId}
            ariaLabel="Open workspaces"
            addLabel="Open a new tab"
            addItems={addItems}
            onActivate={setActiveId}
            onAddSelect={(id) => {
              if (tabs.some((tab) => tab.id === id)) {
                setActiveId(id);
                return;
              }
              const label = id === "pull-requests" ? "Pull requests" : "New tab";
              setTabs((prev) => [
                ...prev,
                {
                  id,
                  label,
                  icon:
                    id === "pull-requests" ? (
                      <GitPullRequest className="size-3.5" />
                    ) : (
                      <Plus className="size-3.5" />
                    ),
                },
              ]);
              setActiveId(id);
            }}
            onClose={(closeId) => {
              const next = tabs.filter((tab) => tab.id !== closeId);
              setTabs(next);
              if (closeId === activeId) {
                setActiveId(next[next.length - 1]?.id ?? next[0]?.id ?? "");
              }
            }}
          />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ToolbarIconButton label="Settings">
            <Settings className="size-3.5" />
          </ToolbarIconButton>
        </div>
      </div>

      <div className="flex bg-background" style={{ height: "42rem" }}>
        {activeId === "new-tab" ? (
          <LandingContent
            openPullRequests={() => {
              if (!tabs.some((tab) => tab.id === "pull-requests")) {
                setTabs((prev) => [
                  ...prev,
                  { id: "pull-requests", label: "Pull requests", icon: <GitPullRequest /> },
                ]);
              }
              setActiveId("pull-requests");
            }}
          />
        ) : (
          <>
            {openProjectWorkspace ? null : (
              <aside className="border-border/70 bg-surface-toolbar flex w-10 shrink-0 flex-col items-center gap-1 border-r px-1 py-2">
                <ToolbarIconButton
                  label="Toggle sidebar"
                  active={!sidebarCollapsed}
                  onClick={() => setSidebarCollapsed((prev) => !prev)}
                >
                  <PanelLeftClose className="size-4" />
                </ToolbarIconButton>
              </aside>
            )}
            {activeId === "pull-requests" ? (
              <PullRequestHost />
            ) : (
              <>
                {tabs.some((tab) => tab.id === "marketplace") && activeId === "marketplace" ? (
                  <>
                    <aside
                      className={cn(
                        "bg-surface-toolbar flex shrink-0 flex-col border-border/70 transition-[width] duration-200 ease-out",
                        sidebarCollapsed ? "w-0 overflow-hidden" : "w-72 border-r",
                      )}
                    >
                      <div className="border-border/70 flex min-h-10 items-center justify-between gap-2 border-b px-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[13px]">marketplace_bo_fe</div>
                          <div className="text-muted-foreground truncate text-[11px]">main</div>
                        </div>
                        <div className="flex items-center gap-1">
                          <ToolbarIconButton label="Choose repository">
                            <FolderClosed className="size-3.5" />
                          </ToolbarIconButton>
                          <ToolbarIconButton label="Refresh">
                            <RotateCw className="size-3.5" />
                          </ToolbarIconButton>
                        </div>
                      </div>
                      <div className="px-3 py-2">
                        <input
                          aria-label="Commit message"
                          placeholder="Message (⌘↵ to commit)"
                          className="border-input bg-input h-8 w-full rounded-md border px-2.5 text-[13px] outline-none"
                        />
                      </div>
                      <div className="border-border/70 flex min-h-0 flex-1 flex-col border-t">
                        <PierreFileTreeBrowser
                          navRegion="storybook-changes"
                          files={changedFiles.map((file) => ({ path: file.path }))}
                          selectedPath={activePath}
                          onActivatePath={setActivePath}
                          gitStatus={gitStatus}
                        />
                      </div>
                    </aside>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="border-border/70 flex min-h-9 items-center gap-2 border-b px-2.5">
                        <Tabs value={projectView} onValueChange={setProjectView}>
                          <TabsList aria-label="Project views" className="bg-transparent">
                            {projectNavTabs.map((tab) => (
                              <TabsTrigger key={tab.id} value={tab.id}>
                                {tab.icon}
                                {tab.label}
                              </TabsTrigger>
                            ))}
                          </TabsList>
                        </Tabs>
                        <div className="ml-auto flex items-center gap-1">
                          <ToolbarIconButton label="Toggle inline sidebar">
                            <PanelLeftClose className="size-3.5" />
                          </ToolbarIconButton>
                          <ToolbarIconButton label="Commit selection">
                            <CheckSquare className="size-3.5" />
                          </ToolbarIconButton>
                        </div>
                      </div>
                      {projectView === "changes" ? (
                        <DiffStage activePath={activePath} />
                      ) : (
                        <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                          Pull request list
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                    bo-ui workspace
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const InteractiveShell: Story = {
  render: () => <ShellDemo />,
};
