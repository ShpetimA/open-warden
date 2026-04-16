import { FileCode2, GitPullRequest, MessagesSquare, ShieldCheck } from "lucide-react";
import { useQueryState } from "nuqs";
import { Outlet, useLocation, useNavigate, useParams } from "react-router";
import {
  pullRequestPreviewSearchParsers,
  serializePullRequestPreviewSearch,
} from "@/features/pull-requests/searchParams";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import type { GitProviderId } from "@/platform/desktop";

export type PreviewTab = "overview" | "conversation" | "files" | "checks";

type PreviewTabPathInput = {
  providerId: GitProviderId;
  owner: string;
  repo: string;
  pullRequestNumber: number;
  tab: PreviewTab;
};

export function buildPreviewTabPath({
  providerId,
  owner,
  repo,
  pullRequestNumber,
  tab,
}: PreviewTabPathInput) {
  return `${buildPullRequestPreviewPath({ providerId, owner, repo, pullRequestNumber })}/${tab}`;
}

function parsePreviewTabFromPathname(pathname: string): PreviewTab {
  if (pathname.endsWith("/conversation")) return "conversation";
  if (pathname.endsWith("/files")) return "files";
  if (pathname.endsWith("/checks")) return "checks";
  return "overview";
}

export function PullRequestPreviewLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [selectedFilePath] = useQueryState("file", pullRequestPreviewSearchParsers.file);
  const activeTab = parsePreviewTabFromPathname(location.pathname);
  const parsedPullRequestNumber = Number.parseInt(pullRequestNumber ?? "", 10);

  const hasValidRoute = Boolean(
    providerId &&
    owner &&
    repo &&
    Number.isFinite(parsedPullRequestNumber) &&
    parsedPullRequestNumber > 0,
  );

  const handleTabChange = (tab: PreviewTab) => {
    if (!hasValidRoute || !providerId || !owner || !repo) {
      return;
    }

    const nextPath = buildPreviewTabPath({
      providerId: providerId as GitProviderId,
      owner,
      repo,
      pullRequestNumber: parsedPullRequestNumber,
      tab,
    });

    navigate(
      serializePullRequestPreviewSearch(nextPath, {
        file: selectedFilePath ?? null,
      }),
    );
  };

  return (
    <div className="flex h-full min-h-0">
      <PullRequestPreviewModeRail activeTab={activeTab} onTabChange={handleTabChange} />
      <div className="min-w-0 flex-1 h-full">
        <Outlet />
      </div>
    </div>
  );
}

function PullRequestPreviewModeRail({
  activeTab,
  onTabChange,
}: {
  activeTab: PreviewTab;
  onTabChange: (tab: PreviewTab) => void;
}) {
  return (
    <aside className="border-border/70 bg-surface-toolbar flex w-12 shrink-0 flex-col items-center gap-1 border-r px-2 py-2">
      <PreviewModeRailButton
        active={activeTab === "overview"}
        icon={GitPullRequest}
        title="Overview"
        onClick={() => onTabChange("overview")}
      />
      <PreviewModeRailButton
        active={activeTab === "conversation"}
        icon={MessagesSquare}
        title="Conversation"
        onClick={() => onTabChange("conversation")}
      />
      <PreviewModeRailButton
        active={activeTab === "files"}
        icon={FileCode2}
        title="Files"
        onClick={() => onTabChange("files")}
      />
      <PreviewModeRailButton
        active={activeTab === "checks"}
        icon={ShieldCheck}
        title="Checks"
        onClick={() => onTabChange("checks")}
      />
    </aside>
  );
}

function PreviewModeRailButton({
  active,
  icon: Icon,
  title,
  onClick,
}: {
  active: boolean;
  icon: typeof GitPullRequest;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
        active
          ? "bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
      }`}
      aria-label={title}
      title={title}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
