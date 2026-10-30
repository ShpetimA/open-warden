import { PullRequestRefreshNotice } from "../refresh/PullRequestRefreshControl";
import { useRetainPullRequestRefresh } from "../refresh/PullRequestRefreshProvider";
import { useAppSelector } from "@/app/hooks";
import { useResolveHostedRepoQuery } from "@/features/hosted-repos/api";
import { Outlet, useLocation, useParams } from "react-router";
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
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const params = useParams();
  const { hosted } = useResolveHostedRepoQuery(repoPath, {
    skip: !repoPath,
    selectFromResult: ({ currentData }) => ({ hosted: currentData }),
  });
  const { pathname } = useLocation();
  const number = Number(params.pullRequestNumber);
  const locator =
    repoPath &&
    Number.isInteger(number) &&
    number > 0 &&
    hosted &&
    hosted.providerId === params.providerId &&
    hosted.owner === params.owner &&
    hosted.repo === params.repo
      ? { repoPath, pullRequestNumber: number }
      : null;
  useRetainPullRequestRefresh(locator);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {!pathname.endsWith("/overview") ? <PullRequestRefreshNotice locator={locator} /> : null}
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
