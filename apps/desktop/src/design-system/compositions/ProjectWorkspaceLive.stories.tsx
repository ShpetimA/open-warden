import { ProjectMonogram } from "@/components/ui/project-monogram";
import {
  repoRailSections,
  pullRequestRailSections,
} from "@/features/workspaces/components/WorkspaceRail";
import { WorkspaceChrome } from "@/components/layout/WorkspaceChrome";
import {
  projectActivated,
  projectRemoved,
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceActivated,
  workspaceRemoved,
  workspaceLocationChanged,
} from "@/features/workspaces/workspacesSlice";
import { reduceWorkspaceState } from "@/features/workspaces/workspaceState";
import { useReducer } from "react";
import { parseDiffFromFile, type ThemeTypes } from "@pierre/diffs";
import { FileDiff as PierreFileDiff, Virtualizer } from "@pierre/diffs/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { List, GitPullRequest, PanelLeftClose, Search, Settings, WrapText } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";

import { PullRequestRow } from "@/components/ui/pull-request-row";
import { WorkspaceTabs, type WorkspaceTabItem } from "@/components/ui/workspace-tabs";
import SidebarTabButton from "@/components/ui/sidebar-tab";
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

function ShellDemo({ review = false }: { review?: boolean }) {
  const [state, dispatch] = useReducer(reduceWorkspaceState, undefined, () => {
    let next = reduceWorkspaceState(
      undefined,
      repoWorkspaceUpserted({ repoPath: "/projects/marketplace_bo_fe" }),
    );
    next = reduceWorkspaceState(
      next,
      pullRequestWorkspaceUpserted({
        repoPath: "/projects/bo-ui",
        providerId: "github",
        owner: "acme",
        repo: "bo-ui",
        pullRequestNumber: 41,
        title: "Workspace navigation",
        activate: false,
      }),
    );
    if (review) {
      const tab = next.workspaces.items.find((item) => item.kind === "pull-request");
      if (tab) next = reduceWorkspaceState(next, workspaceActivated({ id: tab.id }));
    }
    return next;
  });
  const [activePath, setActivePath] = useState(PRODUCT_PATH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const active = state.workspaces.items.find(
    (item) => item.id === state.workspaces.activeWorkspaceId,
  );
  const currentPath = active
    ? (state.workspaces.locations[active.id] ??
      (active.kind === "repo" ? "/changes" : "/pull-requests/github/acme/bo-ui/41/overview"))
    : "";
  const sections = active ? repoRailSections() : [];
  const reviewSections =
    active?.kind === "pull-request" ? pullRequestRailSections(active, false) : [];
  const reviews = state.workspaces.items.filter(
    (item) => item.kind === "pull-request" && item.repoPath === active?.repoPath,
  );
  const section =
    (active?.kind === "pull-request" ? reviewSections : sections).find((item) =>
      item.isActive(currentPath),
    )?.label ?? "";
  const gitStatus = buildPierreGitStatusEntries(
    changedFiles,
    (file) => file.path,
    (file) => file.status,
  );
  const tabs: WorkspaceTabItem[] = state.workspaces.items
    .filter((item) => item.kind === "repo")
    .map((item) => ({
      id: item.id,
      label: item.repoPath.split("/").at(-1) ?? "Project",
      icon: (
        <ProjectMonogram
          name={item.repoPath.split("/").at(-1) ?? "Project"}
          identity={item.repoPath}
        />
      ),
    }));
  return (
    <div className="h-[46rem] overflow-hidden rounded-xl border border-border">
      <WorkspaceChrome
        header={
          <header className="border-border bg-surface-toolbar flex items-center gap-3 border-b px-3">
            <WorkspaceTabs
              className="min-w-0 flex-1 border-b-0"
              items={tabs}
              activeId={active?.repoPath ?? ""}
              ariaLabel="Open projects"
              closeShortcut="⌘⇧W"
              overflowLabel="All open projects"
              onActivate={(repoPath) => dispatch(projectActivated({ repoPath }))}
              onClose={(repoPath) => dispatch(projectRemoved({ repoPath }))}
              onAdd={() =>
                dispatch(repoWorkspaceUpserted({ repoPath: "/projects/invoice-service" }))
              }
            />
            <ToolbarIconButton label="Settings">
              <Settings className="size-4" />
            </ToolbarIconButton>
          </header>
        }
        rail={
          active ? (
            <aside className="border-border/70 bg-surface-toolbar flex w-14 shrink-0 flex-col items-center gap-1 border-r px-1.5 py-2">
              {sections.map((item) => (
                <SidebarTabButton
                  key={item.key}
                  label={item.label}
                  icon={item.icon}
                  isActive={item.isActive(currentPath)}
                  onClick={() => {
                    dispatch(workspaceLocationChanged({ id: active.repoPath, path: item.path }));
                    dispatch(workspaceActivated({ id: active.repoPath }));
                  }}
                />
              ))}
              <div className="mt-auto">
                <SidebarTabButton
                  label="Toggle sidebar"
                  icon={<PanelLeftClose />}
                  isActive={!sidebarCollapsed}
                  onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                />
              </div>
            </aside>
          ) : null
        }
      >
        {!active ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Open a project to get started.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            {currentPath.startsWith("/pull-requests") && reviews.length > 0 && (
              <div className="flex h-8 shrink-0 items-center border-b bg-background">
                <WorkspaceTabs
                  variant="secondary"
                  className="min-w-0 flex-1 border-b-0"
                  ariaLabel="Project pull requests"
                  activeId={active.id}
                  items={[
                    {
                      id: active.repoPath,
                      label: "Pull requests",
                      icon: <List />,
                      closable: false,
                    },
                    ...reviews.map((item) => ({
                      id: item.id,
                      label:
                        item.kind === "pull-request"
                          ? `#${item.pullRequestNumber} ${item.title}`
                          : "",
                      icon: <GitPullRequest />,
                    })),
                  ]}
                  onActivate={(id) => {
                    if (id === active.repoPath)
                      dispatch(workspaceLocationChanged({ id, path: "/pull-requests" }));
                    dispatch(workspaceActivated({ id }));
                  }}
                  onClose={(id) => dispatch(workspaceRemoved({ id }))}
                />
                {reviewSections.map((item) => (
                  <button
                    key={item.key}
                    className="h-6 rounded px-2 text-xs hover:bg-accent aria-[current=page]:bg-surface-active"
                    aria-current={item.isActive(currentPath) ? "page" : undefined}
                    onClick={() =>
                      dispatch(workspaceLocationChanged({ id: active.id, path: item.path }))
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
            {section === "Pull Requests" ||
            (active.kind === "pull-request" && section === "Overview") ? (
              <PullRequestHost />
            ) : (
              <div className="flex min-h-0 flex-1">
                {!sidebarCollapsed ? (
                  <aside className="bg-surface-toolbar border-border/70 flex w-72 flex-col border-r">
                    <div className="px-3 py-3 text-sm font-medium">
                      {active.kind === "repo" ? "Changed files" : "Pull request files"}
                    </div>
                    <PierreFileTreeBrowser
                      navRegion="storybook-changes"
                      files={changedFiles.map((file) => ({ path: file.path }))}
                      selectedPath={activePath}
                      onActivatePath={setActivePath}
                      gitStatus={gitStatus}
                    />
                  </aside>
                ) : null}
                {section === "Changes" || section === "Files" || section === "Repository files" ? (
                  <DiffStage activePath={activePath} />
                ) : (
                  <div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
                    {section}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </WorkspaceChrome>
    </div>
  );
}

export const InteractiveShell: Story = {
  render: () => <ShellDemo />,
};

export const NarrowShell: Story = {
  render: () => (
    <div className="w-[680px] max-w-full">
      <ShellDemo />
    </div>
  ),
};

export const NestedReviews: Story = { render: () => <ShellDemo review /> };
export const NarrowReviews: Story = {
  render: () => (
    <div className="w-[680px] max-w-full">
      <ShellDemo review />
    </div>
  ),
};
