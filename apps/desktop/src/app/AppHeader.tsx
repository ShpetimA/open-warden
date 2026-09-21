import { Copy, RotateCcw, Search, Settings2 } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { FeatureKey } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DesktopUpdateButton } from "@/features/desktop-update/DesktopUpdateButton";
import { WorkspaceTabBar } from "@/features/workspaces/components/WorkspaceTabBar";
import { copyComments, copyLastCommentsPayload } from "@/features/comments/actions";
import { countCommentsForRepoContext } from "@/features/comments/selectors";
import { gitApi } from "@/features/source-control/api";
import {
  getHistoryComparison,
  type HistoryComparison,
} from "@/features/source-control/historySelection";
import type { CommentContext } from "@/features/source-control/types";

type AppHeaderProps = {
  activeFeature: FeatureKey | null;
  currentPath: string;
  showWorkspaceTabs: boolean;
  onOpenWorkspaces?: () => void;
  onOpenCommandPalette: () => void;
};

function copyAndClearMessage(count: number): string {
  return `Copied ${count} comment${count === 1 ? "" : "s"} and cleared them`;
}

function getCommentContext(
  activeFeature: FeatureKey,
  reviewBaseRef: string,
  reviewHeadRef: string,
  historyCommitId: string,
  historyComparison: HistoryComparison | null,
): CommentContext | null {
  if (activeFeature === "history") {
    if (historyComparison) {
      return {
        kind: "history-range",
        baseRef: historyComparison.baseRef,
        headRef: historyComparison.headRef,
      };
    }
    if (!historyCommitId) return null;
    return { kind: "history", commitId: historyCommitId };
  }

  const isReviewFeature = activeFeature === "review" || activeFeature === "pull-requests";

  if (isReviewFeature) {
    if (!reviewBaseRef || !reviewHeadRef) return null;
    return { kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef };
  }

  return { kind: "changes" };
}

function selectHeaderCommentContext(
  state: RootState,
  activeFeature: FeatureKey,
  _currentPath: string,
): CommentContext | null {
  const activeRepo = state.sourceControl.activeRepo;
  const historyCommits = activeRepo
    ? (gitApi.endpoints.getCommitHistory.select({ repoPath: activeRepo })(state).data ?? [])
    : [];
  const historyComparison = getHistoryComparison(
    historyCommits,
    state.sourceControl.historySelectedCommitIds,
  );

  return getCommentContext(
    activeFeature,
    state.sourceControl.reviewBaseRef,
    state.sourceControl.reviewHeadRef,
    state.sourceControl.historyCommitId,
    historyComparison,
  );
}

function selectHeaderCommentCount(
  state: RootState,
  activeFeature: FeatureKey,
  currentPath: string,
): number {
  const activeRepo = state.sourceControl.activeRepo;
  if (!activeRepo) return 0;

  const commentContext = selectHeaderCommentContext(state, activeFeature, currentPath);
  if (!commentContext) return 0;

  return countCommentsForRepoContext(state.comments, activeRepo, commentContext);
}

type HeaderCommentActionsProps = {
  activeFeature: FeatureKey;
  currentPath: string;
};

function HeaderCommentActions({ activeFeature, currentPath }: HeaderCommentActionsProps) {
  const dispatch = useAppDispatch();
  const commentContext = useAppSelector((state) =>
    selectHeaderCommentContext(state, activeFeature, currentPath),
  );
  const commentCount = useAppSelector((state) =>
    selectHeaderCommentCount(state, activeFeature, currentPath),
  );
  const hasLastCopiedPayload = useAppSelector(
    (state) => state.commentsClipboard.lastCopiedPayload.length > 0,
  );
  const hasComments = commentCount > 0;

  const onCopyAllComments = async () => {
    if (!commentContext) return;
    const result = await dispatch(copyComments("all", { context: commentContext }));
    if (result.ok) toast.success(copyAndClearMessage(result.clearedCount));
  };

  const onCopyLastComments = async () => {
    const result = await dispatch(copyLastCommentsPayload());
    if (result.ok) toast.success("Copied last comments payload");
  };

  useHotkey(
    "Mod+Alt+C",
    () => {
      void onCopyAllComments();
    },
    {
      enabled: hasComments,
    },
  );

  const shouldShowButton = hasComments || (!hasComments && hasLastCopiedPayload);
  if (!shouldShowButton) return null;

  const isRecopyMode = !hasComments && hasLastCopiedPayload;
  const tooltipText = isRecopyMode
    ? "Copy last comments payload"
    : commentContext?.kind === "review"
      ? "Copy local review comments (⌘⌥C)"
      : commentContext?.kind === "history-range"
        ? "Copy combined history comments (⌘⌥C)"
        : commentContext?.kind === "history"
          ? "Copy commit comments (⌘⌥C)"
          : "Copy all comments (⌘⌥C)";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
            onClick={() => void (isRecopyMode ? onCopyLastComments() : onCopyAllComments())}
            aria-label={tooltipText}
          >
            <Copy
              className={`h-3.5 w-3.5 transition-all duration-200 ${
                isRecopyMode ? "scale-0 opacity-0" : "scale-100 opacity-100"
              }`}
            />
            <RotateCcw
              className={`absolute h-3.5 w-3.5 transition-all duration-200 ${
                isRecopyMode ? "scale-100 opacity-100" : "scale-0 opacity-0"
              }`}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type HeaderActionsProps = {
  activeFeature: FeatureKey | null;
  currentPath: string;
  onOpenCommandPalette: () => void;
};

function HeaderActions({ activeFeature, currentPath, onOpenCommandPalette }: HeaderActionsProps) {
  const navigate = useNavigate();

  return (
    <div className="app-no-drag flex shrink-0 items-center justify-self-end gap-1">
      {activeFeature ? (
        <HeaderCommentActions activeFeature={activeFeature} currentPath={currentPath} />
      ) : null}

      <DesktopUpdateButton />

      <button
        type="button"
        className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
        onClick={() => {
          navigate("/settings");
        }}
        title="Open Settings"
        aria-label="Open settings"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex h-7 w-7 items-center justify-center rounded-md transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
        onClick={onOpenCommandPalette}
        title="Open Command Palette (⌘K)"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function AppHeader({
  activeFeature,
  currentPath,
  showWorkspaceTabs,
  onOpenWorkspaces,
  onOpenCommandPalette,
}: AppHeaderProps) {
  return (
    <header className="app-drag-region border-border bg-surface-toolbar flex h-10 select-none items-center justify-between gap-3 border-b pl-22 pr-3">
      {showWorkspaceTabs ? <WorkspaceTabBar onOpenWorkspaces={onOpenWorkspaces} /> : null}

      <HeaderActions
        activeFeature={activeFeature}
        currentPath={currentPath}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    </header>
  );
}
