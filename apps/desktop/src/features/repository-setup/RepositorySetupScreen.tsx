import { useEffect, useRef, useState } from "react";
import { Check, Circle, FolderGit2, GitPullRequest, LoaderCircle } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import { workspacePath } from "@/features/workspaces/workspaceRoutes";
import { pullRequestWorkspaceId } from "@/features/workspaces/workspacesSlice";
import { setupClosed, setupProgressed, startRepositorySetup } from "./repositorySetupSlice";

export function RepositorySetupScreen() {
  const [params] = useSearchParams();
  const url = params.get("url");
  return <RepositorySetupView key={url} url={url} />;
}

function RepositorySetupView({ url }: { url: string | null }) {
  const setup = useAppSelector((state) =>
    state.repositorySetup.items.find((item) => item.link.url === url && item.visible),
  );
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const opening = useRef(false);
  const [openingReview, setOpeningReview] = useState(false);

  useEffect(() => {
    if (setup?.progress.stage !== "ready" || opening.current) return;
    opening.current = true;
    setOpeningReview(true);
    const { workspace } = setup.progress;
    const setupUrl = setup.link.url;
    let cancelled = false;

    async function openReview() {
      try {
        const opened = await dispatch(
          openPullRequestWorkspace(workspace, { canActivate: () => !cancelled }),
        );
        if (!opened) {
          if (!cancelled)
            dispatch(
              setupProgressed({
                url: setupUrl,
                progress: {
                  stage: "error",
                  failedStage: "opening",
                  message:
                    "This folder could not be opened as a Git repository. Retry setup to prepare it again.",
                },
              }),
            );
          return;
        }
        dispatch(setupClosed(setupUrl));
        if (cancelled) return;
        navigate(
          workspacePath({
            ...workspace,
            id: pullRequestWorkspaceId(workspace),
            kind: "pull-request",
          }),
          { replace: true },
        );
      } catch (cause) {
        if (!cancelled) {
          dispatch(
            setupProgressed({
              url: setupUrl,
              progress: {
                stage: "error",
                failedStage: "opening",
                message: cause instanceof Error ? cause.message : "Could not open the repository.",
              },
            }),
          );
        }
      } finally {
        opening.current = false;
        if (!cancelled) setOpeningReview(false);
      }
    }

    void openReview();
    return () => {
      cancelled = true;
    };
  }, [setup, dispatch, navigate]);

  if (!setup) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-muted-foreground text-sm">This repository setup tab is closed.</p>
        <Button variant="outline" onClick={() => navigate("/changes")}>
          Back to workspace
        </Button>
      </div>
    );
  }

  const { link, progress } = setup;
  const failed = progress.stage === "error";
  const currentStage = progress.stage === "error" ? progress.failedStage : progress.stage;
  const step =
    currentStage === "locating"
      ? 0
      : currentStage === "ready" || currentStage === "opening"
        ? 2
        : 1;
  const steps = [
    { title: "Find repository", detail: "Check open and recent repositories for this remote." },
    {
      title: "Prepare repository",
      detail: "If needed, download the PR branches and create a managed checkout.",
    },
    { title: "Open pull request", detail: "Open the repository and its pull request review." },
  ];

  return (
    <div className="h-full overflow-auto" data-workspace-scroll>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-12 sm:px-10">
        <header className="flex flex-col gap-3">
          <FolderGit2 className="text-muted-foreground size-7" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold">
              {failed ? "Repository setup needs attention" : "Opening pull request"}
            </h1>
            <p className="text-muted-foreground break-words text-sm">
              {link.owner}/{link.repo}
            </p>
          </div>
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="text-primary inline-flex w-fit items-center gap-2 text-sm underline-offset-4 hover:underline focus-visible:outline-ring"
          >
            <GitPullRequest className="size-4" aria-hidden="true" />
            <span className="tabular-nums">
              {link.providerId === "github" ? "GitHub" : "Bitbucket"} pull request #
              {link.pullRequestNumber}
            </span>
          </a>
        </header>

        <ol aria-label="Repository setup progress" className="flex flex-col gap-6">
          {steps.map((item, index) => {
            const current = index === step;
            const Icon = index < step ? Check : current && !failed ? LoaderCircle : Circle;
            return (
              <li
                key={item.title}
                aria-current={current ? "step" : undefined}
                className="flex gap-3"
              >
                <Icon
                  aria-hidden="true"
                  className={`mt-0.5 size-4 shrink-0 ${current && !failed ? "animate-spin motion-reduce:animate-none" : "text-muted-foreground"}`}
                />
                <div className="flex min-w-0 flex-col gap-1">
                  <p className={`text-sm ${current ? "font-medium" : "text-muted-foreground"}`}>
                    {item.title}
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">{item.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {failed ? (
          <div
            role="alert"
            className="flex flex-col gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="text-destructive break-words text-sm">{progress.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void dispatch(startRepositorySetup(link))}>
                Retry setup
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/settings")}>
                Provider settings
              </Button>
            </div>
          </div>
        ) : (
          <p role="status" className="text-muted-foreground text-xs leading-relaxed">
            {openingReview
              ? "Opening the repository and review…"
              : progress.stage === "locating"
                ? "Looking for a local repository…"
                : "Downloading repository data and preparing the review checkout…"}
            <span className="mt-1 block">You can switch tabs while setup runs.</span>
          </p>
        )}
      </main>
    </div>
  );
}
