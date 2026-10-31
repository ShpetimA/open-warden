import { GitPullRequest } from "lucide-react";
import { useNavigate } from "react-router";

import { useAppDispatch } from "@/app/hooks";
import { parsePullRequestLink } from "@/platform/desktop/pullRequestLink";
import {
  repositorySetupPath,
  startRepositorySetup,
} from "@/features/repository-setup/repositorySetupSlice";
import type { ComposerChoice } from "./CommandComposerChoiceStep";

export function usePullRequestLinkChoice(query: string, onClose: () => void) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const link = parsePullRequestLink(query);
  const choice: ComposerChoice | null = link
    ? {
        id: "open-pr-link",
        label: `Open pull request #${link.pullRequestNumber}`,
        detail: `${link.owner}/${link.repo} · ${link.providerId === "github" ? "GitHub" : "Bitbucket"}`,
        icon: GitPullRequest,
        section: "Pull request link",
      }
    : null;

  function openLink() {
    if (!link) return;
    void dispatch(startRepositorySetup(link));
    navigate(repositorySetupPath(link.url));
    onClose();
  }

  return { choice, openLink };
}
