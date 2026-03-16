import {
  Copy,
  PanelLeftInactive,
  PanelLeftOpen,
  PanelRightInactive,
  PanelRightOpen,
  RotateCcw,
  Search,
} from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ThemeSwitcher } from "@/app/ThemeSwitcher";
import { FEATURE_NAV_ITEMS, FEATURE_SIDEBARS, type FeatureKey } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useSidebarPanelRegistry } from "@/components/layout/SidebarPanelRegistry";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { DesktopUpdateButton } from "@/features/desktop-update/DesktopUpdateButton";
import { copyComments, copyLastCommentsPayload } from "@/features/comments/actions";
import { compactComments } from "@/features/comments/selectors";
import type { CommentContext } from "@/features/source-control/types";

type AppHeaderProps = {
  activeFeature: FeatureKey;
  onOpenCommandPalette: () => void;
};

function copyAndClearMessage(count: number): string {
  return `Copied ${count} comment${count === 1 ? "" : "s"} and cleared them`;
}

function useCommentContext(activeFeature: FeatureKey): CommentContext | null {
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef);
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef);

  if (activeFeature === "review") {
    if (!reviewBaseRef || !reviewHeadRef) return null;
    return { kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef };
  }

  return { kind: "changes" };
}

type HeaderCommentActionsProps = {
  activeFeature: FeatureKey;
};

function HeaderCommentActions({ activeFeature }: HeaderCommentActionsProps) {
  const dispatch = useAppDispatch();
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const comments = useAppSelector((state) => state.comments);
  const hasLastCopiedPayload = useAppSelector(
    (state) => state.commentsClipboard.lastCopiedPayload.length > 0,
  );
  const commentContext = useCommentContext(activeFeature);

  const allComments = compactComments(comments);
  const currentRepoComments = activeRepo
    ? allComments.filter((comment) => comment.repoPath === activeRepo)
    : [];
  const currentContextComments = commentContext
    ? currentRepoComments.filter((comment) => {
        const kind = comment.contextKind ?? "changes";
        if (kind !== commentContext.kind) return false;
        if (commentContext.kind === "review") {
          return comment.baseRef === commentContext.baseRef && comment.headRef === commentContext.headRef;
        }
        return true;
      })
    : [];
  const hasComments = currentContextComments.length > 0;

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
    : "Copy all comments (⌘⌥C)";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="border-input bg-surface-alt text-muted-foreground hover:text-foreground relative inline-flex h-8 w-8 items-center justify-center rounded-md border"
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

export function AppHeader({ activeFeature, onOpenCommandPalette }: AppHeaderProps) {
  const navigate = useNavigate();
  const { panels, toggle } = useSidebarPanelRegistry();
  const sidebars = FEATURE_SIDEBARS[activeFeature];

  return (
    <header className="app-drag-region border-border bg-surface-toolbar grid h-14 select-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b pl-22 pr-3">
      <div className="min-w-0">
        <div className="app-no-drag bg-surface-alt border-input inline-flex items-center gap-0.5 rounded-md border p-0.5">
          {sidebars.map((sidebar) => {
            const entry = panels.get(sidebar.panelId);
            const isCollapsed = entry?.collapsed ?? true;
            const Icon =
              sidebar.icon === "left"
                ? isCollapsed
                  ? PanelLeftInactive
                  : PanelLeftOpen
                : isCollapsed
                  ? PanelRightInactive
                  : PanelRightOpen;

            return (
              <button
                key={sidebar.panelId}
                type="button"
                className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors ${
                  isCollapsed
                    ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                    : "text-foreground"
                }`}
                onClick={() => {
                  toggle(sidebar.panelId);
                }}
                title={isCollapsed ? "Show sidebar" : "Hide sidebar"}
                aria-label={isCollapsed ? "Show sidebar" : "Hide sidebar"}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-w-0 justify-self-center">
        <div className="app-no-drag border-input bg-surface-alt inline-flex w-fit items-center gap-1 rounded-xl border p-1">
          {FEATURE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.key === activeFeature;

            return (
              <button
                key={item.key}
                type="button"
                className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm ${
                  isActive
                    ? "bg-surface-active text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                onClick={() => {
                  navigate(item.path);
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="app-no-drag flex min-w-0 items-center justify-self-end gap-1.5">
        <HeaderCommentActions activeFeature={activeFeature} />

        <DesktopUpdateButton />

        <button
          type="button"
          className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border"
          onClick={onOpenCommandPalette}
          title="Open Command Palette (⌘K)"
          aria-label="Open command palette"
        >
          <Search className="h-3.5 w-3.5" />
        </button>

        <ThemeSwitcher />
      </div>
    </header>
  );
}
