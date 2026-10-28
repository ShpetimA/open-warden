import type { DesktopApi } from "@/platform/desktop/contracts";
import type { PullRequestLink } from "@/platform/desktop/pullRequestLink";
import type { PullRequestWorkspace } from "@/features/workspaces/workspacesSlice";

export type LinkedPullRequestWorkspace = Omit<PullRequestWorkspace, "id" | "kind">;
export type RepositorySetupStage = "locating" | "downloading";
export type LinkedPullRequestResult =
  | { ok: true; workspace: LinkedPullRequestWorkspace }
  | { ok: false; stage: RepositorySetupStage; message: string };

type RepositorySetupDesktop = Pick<
  DesktopApi,
  "resolveHostedRepo" | "preparePullRequestFromUrl" | "getPullRequestConversation"
>;

export async function prepareLinkedPullRequest(
  desktop: RepositorySetupDesktop,
  link: PullRequestLink,
  repoPaths: readonly string[],
  onStage: (stage: RepositorySetupStage) => void,
): Promise<LinkedPullRequestResult> {
  let stage: RepositorySetupStage = "locating";
  try {
    onStage(stage);
    for (const repoPath of new Set(repoPaths)) {
      const resolved = await desktop.resolveHostedRepo(repoPath);
      const hosted = resolved.ok ? resolved.value : null;
      if (
        hosted?.providerId !== link.providerId ||
        hosted.owner.toLowerCase() !== link.owner.toLowerCase() ||
        hosted.repo.toLowerCase() !== link.repo.toLowerCase()
      )
        continue;

      const result = await desktop.getPullRequestConversation({
        repoPath,
        pullRequestNumber: link.pullRequestNumber,
      });
      if (!result.ok) return { ok: false, stage, message: result.error.message };
      const { detail } = result.value;
      return {
        ok: true,
        workspace: {
          repoPath,
          providerId: link.providerId,
          owner: hosted.owner,
          repo: hosted.repo,
          pullRequestNumber: link.pullRequestNumber,
          title: detail.title,
        },
      };
    }

    stage = "downloading";
    onStage(stage);
    const result = await desktop.preparePullRequestFromUrl(link.url);
    if (!result.ok) return { ok: false, stage, message: result.error.message };
    const prepared = result.value;
    return {
      ok: true,
      workspace: {
        repoPath: prepared.repoPath,
        providerId: prepared.providerId,
        owner: prepared.owner,
        repo: prepared.repo,
        pullRequestNumber: prepared.pullRequestNumber,
        title: prepared.title,
      },
    };
  } catch (cause) {
    return {
      ok: false,
      stage,
      message: cause instanceof Error ? cause.message : "Could not set up this pull request.",
    };
  }
}
