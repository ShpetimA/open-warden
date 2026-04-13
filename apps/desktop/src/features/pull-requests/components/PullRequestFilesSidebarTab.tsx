import { skipToken } from "@reduxjs/toolkit/query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { FileCode2, GitBranch } from "lucide-react";
import { useEffect } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router";

import { useGetPullRequestFilesQuery } from "@/features/hosted-repos/api";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { isTypingTarget } from "@/features/source-control/utils";
import type { GitProviderId } from "@/platform/desktop";

function statusTone(status: string) {
  if (status === "added") return "text-emerald-300 bg-emerald-500/10 border-emerald-500/20";
  if (status === "deleted") return "text-rose-300 bg-rose-500/10 border-rose-500/20";
  if (status === "renamed") return "text-amber-300 bg-amber-500/10 border-amber-500/20";
  if (status === "copied") return "text-sky-300 bg-sky-500/10 border-sky-500/20";
  return "text-blue-300 bg-blue-500/10 border-blue-500/20";
}

function parseValidPullRequestNumber(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PullRequestFilesSidebarTab({ activeRepo }: { activeRepo: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { providerId, owner, repo, pullRequestNumber } = useParams();
  const [searchParams] = useSearchParams();
  const selectedPath = searchParams.get("file") ?? "";
  const activeTab = location.pathname.endsWith("/files") ? "files" : "overview";
  const parsedPullRequestNumber = parseValidPullRequestNumber(pullRequestNumber);

  const { files, filesError } = useGetPullRequestFilesQuery(
    activeRepo && parsedPullRequestNumber
      ? {
          repoPath: activeRepo,
          pullRequestNumber: parsedPullRequestNumber,
        }
      : skipToken,
    {
      selectFromResult: ({ data, error }) => ({
        files: data ?? [],
        filesError: data ? "" : errorMessageFrom(error, ""),
      }),
    },
  );

  useEffect(() => {
    if (activeTab !== "files") {
      return;
    }

    if (!selectedPath && files.length > 0 && providerId && owner && repo && parsedPullRequestNumber) {
      const nextUrl = new URL(
        buildPullRequestPreviewPath({
          providerId: providerId as GitProviderId,
          owner,
          repo,
          pullRequestNumber: parsedPullRequestNumber,
        }),
        "https://open-warden.invalid",
      );
      nextUrl.pathname = `${nextUrl.pathname}/files`;
      nextUrl.searchParams.set("file", files[0]?.path ?? "");
      navigate(`${nextUrl.pathname}${nextUrl.search}`, { replace: true });
    }
  }, [activeTab, files, navigate, owner, parsedPullRequestNumber, providerId, repo, selectedPath]);

  const navigateToPath = (path: string, replace = false) => {
    if (!providerId || !owner || !repo || !parsedPullRequestNumber) {
      return;
    }

    const nextUrl = new URL(
      buildPullRequestPreviewPath({
        providerId: providerId as GitProviderId,
        owner,
        repo,
        pullRequestNumber: parsedPullRequestNumber,
      }),
      "https://open-warden.invalid",
    );
    nextUrl.pathname = `${nextUrl.pathname}/files`;
    nextUrl.searchParams.set("file", path);
    navigate(`${nextUrl.pathname}${nextUrl.search}`, { replace });
  };

  const navigateByOffset = (offset: number) => {
    if (activeTab !== "files" || files.length === 0) {
      return;
    }

    const currentIndex = files.findIndex((file) => file.path === selectedPath);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = Math.max(0, Math.min(files.length - 1, safeIndex + offset));
    const nextFile = files[nextIndex];
    if (!nextFile) {
      return;
    }

    navigateToPath(nextFile.path);
  };

  useHotkey(
    { key: "j" },
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      navigateByOffset(1);
    },
    { enabled: activeTab === "files" && files.length > 0 },
  );

  useHotkey(
    { key: "k" },
    (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }
      event.preventDefault();
      navigateByOffset(-1);
    },
    { enabled: activeTab === "files" && files.length > 0 },
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="border-border/70 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <FileCode2 className="text-muted-foreground h-4 w-4" />
          <div className="text-sm font-semibold">PR files</div>
        </div>
        <div className="text-muted-foreground mt-1 text-xs leading-5">
          Navigate changed files with j/k while the Files tab is open.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {filesError ? (
          <div className="text-destructive px-2 py-3 text-sm">{filesError}</div>
        ) : files.length === 0 ? (
          <div className="text-muted-foreground px-2 py-3 text-sm leading-6">
            No changed files were reported for this pull request.
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const selected = file.path === selectedPath;
              return (
                <button
                  key={`${file.path}:${file.previousPath ?? ""}`}
                  type="button"
                  className={`block w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    selected
                      ? "border-primary/35 bg-accent/15"
                      : "border-border/70 bg-background/75 hover:bg-accent/45"
                  }`}
                  onClick={() => {
                    navigateToPath(file.path);
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(file.status)}`}>
                      {file.status}
                    </span>
                  </div>
                  <div className="mt-2 break-all font-mono text-[12px] text-foreground/95">{file.path}</div>
                  {file.previousPath ? (
                    <div className="text-muted-foreground mt-1 break-all text-[11px]">
                      Renamed from {file.previousPath}
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3 text-[11px] font-medium">
                    <span className="text-emerald-300">+{file.additions}</span>
                    <span className="text-rose-300">-{file.deletions}</span>
                    <span className="text-muted-foreground inline-flex items-center gap-1">
                      <GitBranch className="h-3 w-3" />
                      file
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
