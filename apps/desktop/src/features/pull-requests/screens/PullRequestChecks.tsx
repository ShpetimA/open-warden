import { skipToken } from "@reduxjs/toolkit/query";
import { useParams } from "react-router";

import { useAppSelector } from "@/app/hooks";
import { useResolveHostedRepoQuery } from "@/features/hosted-repos/api";
import { PullRequestChecksPanel } from "@/features/pull-requests/components/PullRequestChecksPanel";

export const PullRequestChecks = () => {
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const number = Number(pullRequestNumber);
  const { hostedRepo } = useResolveHostedRepoQuery(activeRepo || skipToken, {
    selectFromResult: ({ data }) => ({ hostedRepo: data ?? null }),
  });

  if (
    !hostedRepo ||
    hostedRepo.providerId !== providerId ||
    hostedRepo.owner !== owner ||
    hostedRepo.repo !== repo ||
    !Number.isInteger(number) ||
    number <= 0
  ) {
    return (
      <div className="text-muted-foreground p-6 text-sm">
        Open a pull request in this project to see its checks.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <PullRequestChecksPanel repoPath={activeRepo} pullRequestNumber={number} />
    </div>
  );
};
