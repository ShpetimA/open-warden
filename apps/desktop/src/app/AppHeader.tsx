import {
  Copy,
  PanelLeftInactive,
  PanelLeftOpen,
  PanelRightInactive,
  PanelRightOpen,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { ThemeSwitcher } from "@/app/ThemeSwitcher";
import { FEATURE_NAV_ITEMS, FEATURE_SIDEBARS, type FeatureKey } from "@/app/featureNavigation";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { useSidebarToggleHotkeys } from "@/app/useSidebarToggleHotkeys";
import { useSidebarPanelRegistry } from "@/components/layout/SidebarPanelRegistry";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DesktopUpdateButton } from "@/features/desktop-update/DesktopUpdateButton";
import { copyComments, copyLastCommentsPayload } from "@/features/comments/actions";
import { countCommentsForRepoContext } from "@/features/comments/selectors";
import type { CommentContext } from "@/features/source-control/types";

type AppHeaderProps = {
  activeFeature: FeatureKey | null;
  currentPath: string;
  onOpenCommandPalette: () => void;
};

function copyAndClearMessage(count: number): string {
  return `Copied ${count} comment${count === 1 ? "" : "s"} and cleared them`;
}

function sidebarLabel(panelId: string) {
  if (panelId === "history-files") return "files pane";
  return "sidebar";
}

function sidebarTooltipLabel(panelId: string) {
  if (panelId === "history-files") return "Toggle files pane";
  return "Toggle sidebar";
}

function sidebarShortcut(icon: "left" | "right") {
  return icon === "left" ? "⌘S" : "⌘⇧S";
}

function getCommentContext(
  activeFeature: FeatureKey,
  currentPath: string,
  reviewBaseRef: string,
  reviewHeadRef: string,
): CommentContext | null {
  const isReviewFeature =
    activeFeature === "review" ||
    activeFeature === "pull-requests" ||
    (activeFeature === "changes" && currentPath.startsWith("/changes/pull-request"));

  if (isReviewFeature) {
    if (!reviewBaseRef || !reviewHeadRef) return null;
    return { kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef };
  }

  return { kind: "changes" };
}

function selectHeaderCommentContext(
  state: RootState,
  activeFeature: FeatureKey,
  currentPath: string,
): CommentContext | null {
  return getCommentContext(
    activeFeature,
    currentPath,
    state.sourceControl.reviewBaseRef,
    state.sourceControl.reviewHeadRef,
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
  const isReviewContext = commentContext?.kind === "review";
  const tooltipText = isRecopyMode
    ? "Copy last comments payload"
    : isReviewContext
      ? "Copy local review comments (⌘⌥C)"
      : "Copy all comments (⌘⌥C)";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
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

type HeaderSidebarTogglesProps = {
  activeFeature: FeatureKey;
};

function HeaderSidebarToggles({ activeFeature }: HeaderSidebarTogglesProps) {
  const { panels, toggle } = useSidebarPanelRegistry();
  const sidebars = FEATURE_SIDEBARS[activeFeature];
  useSidebarToggleHotkeys({ activeFeature, toggle });

  if (sidebars.length === 0) {
    return null;
  }

  return (
    <TooltipProvider>
      <div className="app-no-drag bg-surface-alt border-input inline-flex items-center gap-0.5 rounded-md border p-0.5">
        {sidebars.map((sidebar) => {
          const entry = panels.get(sidebar.panelId);
          const isCollapsed = entry?.collapsed ?? true;
          const label = sidebarLabel(sidebar.panelId);
          const tooltipLabel = sidebarTooltipLabel(sidebar.panelId);
          const shortcut = sidebarShortcut(sidebar.icon);
          const actionLabel = `${isCollapsed ? "Show" : "Hide"} ${label} (${shortcut})`;
          const Icon =
            sidebar.icon === "left"
              ? isCollapsed
                ? PanelLeftInactive
                : PanelLeftOpen
              : isCollapsed
                ? PanelRightInactive
                : PanelRightOpen;

          return (
            <Tooltip key={sidebar.panelId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.95] ${
                    isCollapsed
                      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "text-foreground"
                  }`}
                  onClick={() => {
                    toggle(sidebar.panelId);
                  }}
                  aria-label={actionLabel}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="px-2.5 py-1.5">
                <div className="flex items-center gap-2">
                  <span>{tooltipLabel}</span>
                  <span className="border-input bg-surface-alt text-muted-foreground rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none">
                    {shortcut}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

type HeaderFeatureNavProps = {
  activeFeature: FeatureKey | null;
};

function HeaderFeatureNav({ activeFeature }: HeaderFeatureNavProps) {
  const navigate = useNavigate();

  return (
    <div className="app-no-drag border-input bg-surface-alt inline-flex w-fit items-center gap-1 rounded-xl border p-1">
      {FEATURE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.key === activeFeature;

        return (
          <button
            key={item.key}
            type="button"
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm transition-[transform,background-color] duration-150 ease-[var(--ease-out)] active:scale-[0.97] ${
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
    <div className="app-no-drag flex min-w-0 items-center justify-self-end gap-1.5">
      {activeFeature ? (
        <HeaderCommentActions activeFeature={activeFeature} currentPath={currentPath} />
      ) : null}

      <DesktopUpdateButton />

      <button
        type="button"
        className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
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
        className="border-input bg-surface-alt text-muted-foreground hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border transition-[transform] duration-150 ease-[var(--ease-out)] active:scale-[0.95]"
        onClick={onOpenCommandPalette}
        title="Open Command Palette (⌘K)"
        aria-label="Open command palette"
      >
        <Search className="h-3.5 w-3.5" />
      </button>

      <ThemeSwitcher />
    </div>
  );
}

export function AppHeader({ activeFeature, currentPath, onOpenCommandPalette }: AppHeaderProps) {
  return (
    <header className="app-drag-region border-border bg-surface-toolbar grid h-14 select-none grid-cols-[1fr_auto_1fr] items-center gap-3 border-b pl-22 pr-3">
      <div className="min-w-0">
        {activeFeature ? <HeaderSidebarToggles activeFeature={activeFeature} /> : null}
      </div>

      <div className="min-w-0 justify-self-center">
        <HeaderFeatureNav activeFeature={activeFeature} />
      </div>

      <HeaderActions
        activeFeature={activeFeature}
        currentPath={currentPath}
        onOpenCommandPalette={onOpenCommandPalette}
      />
    </header>
  );
}
