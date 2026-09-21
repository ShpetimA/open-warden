import { pullRequestRailSections } from "./WorkspaceRail";
import { GitPullRequest, List } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { WorkspaceTabs } from "@/components/ui/workspace-tabs";
import { closeWorkspace, selectWorkspace } from "../actions";
import {
  selectActiveWorkspace,
  selectWorkspaces,
  workspaceLocationChanged,
} from "../workspacesSlice";
import { workspacePath } from "../workspaceRoutes";

export function ProjectReviewTabs() {
  const active = useAppSelector(selectActiveWorkspace);
  const items = useAppSelector(selectWorkspaces);
  const locations = useAppSelector((state) => state.workspaces.locations);
  const { pathname } = useLocation();
  const hasLocalReview = useAppSelector((state) => state.pullRequests.currentReview !== null);
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  if (!active || !pathname.startsWith("/pull-requests")) return null;
  const reviews = items.filter(
    (item) => item.kind === "pull-request" && item.repoPath === active.repoPath,
  );
  if (!reviews.length) return null;
  return (
    <div className="flex h-8 shrink-0 items-center border-b bg-background">
      <WorkspaceTabs
        className="min-w-0 flex-1 border-b-0"
        ariaLabel="Project pull requests"
        overflowLabel="All project reviews"
        variant="secondary"
        items={[
          { id: active.repoPath, label: "Pull requests", icon: <List />, closable: false },
          ...reviews.map((item) => ({
            id: item.id,
            label: item.kind === "pull-request" ? `#${item.pullRequestNumber} ${item.title}` : "",
            icon: <GitPullRequest />,
          })),
        ]}
        activeId={active.id}
        onActivate={(id) => {
          if (id === active.repoPath) {
            dispatch(workspaceLocationChanged({ id, path: "/pull-requests" }));
            dispatch(selectWorkspace(id));
            navigate("/pull-requests");
          } else {
            const target = reviews.find((item) => item.id === id);
            if (!target) return;
            dispatch(selectWorkspace(id));
            navigate(locations[id] ?? workspacePath(target));
          }
        }}
        onClose={(id) => dispatch(closeWorkspace(id))}
      />
      {active.kind === "pull-request" && (
        <nav
          aria-label="Review sections"
          className="flex shrink-0 items-center gap-0.5 border-l px-1"
        >
          {pullRequestRailSections(active, hasLocalReview || pathname.includes("/local-")).map(
            (section) => (
              <button
                key={section.key}
                type="button"
                aria-current={section.isActive(pathname) ? "page" : undefined}
                onClick={() => navigate(section.path)}
                className="inline-flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent aria-[current=page]:bg-surface-active aria-[current=page]:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                {section.label}
              </button>
            ),
          )}
        </nav>
      )}
    </div>
  );
}
