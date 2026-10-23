import { Outlet } from "react-router";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import type { GitProviderId } from "@/platform/desktop";

export type PreviewTab = "overview" | "files";

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

export function PullRequestPreviewLayout() {
  return (
    <div className="h-full min-h-0 min-w-0">
      <Outlet />
    </div>
  );
}
