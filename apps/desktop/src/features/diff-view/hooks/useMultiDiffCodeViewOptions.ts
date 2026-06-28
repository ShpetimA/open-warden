import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  processFile,
  type CodeViewLayout,
  type CodeViewOptions,
  type DiffLineAnnotation,
  type DiffTokenEventBaseProps,
  type FileDiffMetadata,
} from "@pierre/diffs";

import { MAX_DIFF_LINE_LENGTH } from "@/features/diff-view/services/diffRenderLimits";
import {
  getParsedDiffRequest,
  loadParsedDiff,
  peekCachedParsedDiff,
} from "@/features/diff-view/services/parsedDiffCache";
import { DIFF_LINE_FOCUS_CSS } from "@/features/source-control/diffLineFocus";
import type { DiffAnnotationItem, DiffFile, SelectionRange } from "@/features/source-control/types";

type DiffStyle = "split" | "unified";

export const MULTI_DIFF_CODE_VIEW_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

[data-diffs-header] {
  background-color: color-mix(in lab, var(--diffs-bg) 94%, var(--diffs-fg));
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 84%, var(--diffs-fg));
  box-shadow: inset 0 1px 0 color-mix(in lab, var(--diffs-fg) 7%, transparent);
  min-width: 0;
  overflow: hidden;
}

[data-diffs-header][data-sticky] {
  z-index: 10;
}

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
}

[data-lsp-diagnostic-token] {
  text-decoration-line: underline;
  text-decoration-style: wavy;
  text-decoration-thickness: 2px;
  text-underline-offset: 2px;
}

[data-lsp-diagnostic-token='error'] {
  text-decoration-color: rgb(220 38 38 / 0.95);
}

[data-lsp-diagnostic-token='warning'] {
  text-decoration-color: rgb(217 119 6 / 0.95);
}

[data-lsp-diagnostic-token='information'] {
  text-decoration-color: rgb(2 132 199 / 0.95);
}

[data-lsp-diagnostic-token='hint'] {
  text-decoration-color: rgb(5 150 105 / 0.95);
}

[data-line][data-lsp-diagnostic-line] {
  --app-diagnostic-line-color: rgb(2 132 199 / 0.65);
  --app-diagnostic-line-bg: color-mix(
    in srgb,
    var(--app-diagnostic-line-color) 14%,
    var(--diffs-computed-diff-line-bg, var(--diffs-bg))
  );
  --diffs-line-bg: var(--app-diagnostic-line-bg);
  box-shadow:
    inset 3px 0 0 var(--app-diagnostic-line-color),
    inset 0 0 0 1px color-mix(in srgb, var(--app-diagnostic-line-color) 18%, transparent);
}

[data-line][data-lsp-diagnostic-line='error'] {
  --app-diagnostic-line-color: rgb(220 38 38 / 0.78);
}

[data-line][data-lsp-diagnostic-line='warning'] {
  --app-diagnostic-line-color: rgb(217 119 6 / 0.78);
}

[data-line][data-lsp-diagnostic-line='information'] {
  --app-diagnostic-line-color: rgb(2 132 199 / 0.68);
}

[data-line][data-lsp-diagnostic-line='hint'] {
  --app-diagnostic-line-color: rgb(5 150 105 / 0.64);
}

[data-interactive-line-numbers] [data-column-number] {
  padding-left: 2.7ch;
}

[data-gutter-utility-slot] {
  left: 0;
  right: auto;
  justify-content: flex-start;
}

[data-utility-button] {
  background-color: transparent;
  color: var(--diffs-fg);
  width: 0.8lh;
  height: 0.8lh;
  margin-right: 0;
  margin-left: 0.70ch;
  border-radius: 999px;
}
${DIFF_LINE_FOCUS_CSS}
`;

export const MULTI_DIFF_CODE_VIEW_LAYOUT: CodeViewLayout = {
  paddingTop: 0,
  gap: 1,
  paddingBottom: 0,
};

export const MULTI_DIFF_SCROLLBAR_CSS = `
.diff-viewport-scroll {
  scrollbar-width: thin;
  scrollbar-color: hsl(var(--muted-foreground) / 0.32) transparent;
  scrollbar-gutter: stable;
}

.diff-viewport-scroll::-webkit-scrollbar {
  width: 12px;
}

.diff-viewport-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.diff-viewport-scroll::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.24);
  border: 4px solid transparent;
  border-radius: 0px;
  background-clip: padding-box;
}

.diff-viewport-scroll::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.38);
}
`;

export type MultiDiffCodeViewTarget = {
  id: string;
  path: string;
};

type FileVersionData = {
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
};

type MultiDiffTargetResult<TTarget extends MultiDiffCodeViewTarget> = {
  target: TTarget;
  result: {
    data?: FileVersionData | null;
  };
};

export type ParsedMultiDiff<TTarget extends MultiDiffCodeViewTarget> = {
  target: TTarget;
  fileDiff: FileDiffMetadata;
};

type MultiDiffDiagnosticsHandlers = {
  onTokenEnter: (itemId: string, props: DiffTokenEventBaseProps) => void;
  onTokenLeave: () => void;
  onPostRender: (itemId: string, rootNode: HTMLElement) => void;
};

type BuildSelectionInput<TTarget extends MultiDiffCodeViewTarget> = {
  itemId: string;
  target: TTarget;
  range: SelectionRange;
};

type UseMultiDiffCodeViewOptionsInput<TTarget extends MultiDiffCodeViewTarget, TSelection> = {
  diffStyle: DiffStyle;
  theme: CodeViewOptions<DiffAnnotationItem>["theme"];
  themeType: CodeViewOptions<DiffAnnotationItem>["themeType"];
  expandUnchanged: boolean;
  activeItemId: string | null;
  targetById: Map<string, TTarget>;
  diagnostics: MultiDiffDiagnosticsHandlers;
  onHoverTokenClick: (props: DiffTokenEventBaseProps, event: MouseEvent) => boolean;
  onNavigationTokenClick: (props: DiffTokenEventBaseProps, event: MouseEvent) => void;
  onSelectItem: (itemId: string) => void;
  buildSelection: (input: BuildSelectionInput<TTarget>) => TSelection;
  setSelectedRange: (selection: TSelection | null) => void;
  setComposerRange: (selection: TSelection | null) => void;
};

type MultiDiffCodeViewInteraction<TTarget extends MultiDiffCodeViewTarget, TSelection> = Pick<
  UseMultiDiffCodeViewOptionsInput<TTarget, TSelection>,
  | "activeItemId"
  | "targetById"
  | "diagnostics"
  | "onHoverTokenClick"
  | "onNavigationTokenClick"
  | "onSelectItem"
  | "buildSelection"
  | "setSelectedRange"
  | "setComposerRange"
>;

export function countFileLines(file: DiffFile | null) {
  if (!file) return null;
  if (file.contents.length === 0) return 1;

  let lines = 1;
  for (let index = 0; index < file.contents.length; index += 1) {
    if (file.contents[index] === "\n") lines += 1;
  }
  return lines;
}

export function getCodeViewItemNextVersion(item: { version?: unknown }) {
  return typeof item.version === "number" ? item.version + 1 : 1;
}

export function createPlaceholderDiff(path: string, message: string): FileDiffMetadata {
  const fileName = path || "Diff unavailable";
  const patch = `diff --git a/${fileName} b/${fileName}\n--- a/${fileName}\n+++ b/${fileName}\n@@ -0,0 +1 @@\n+${message}\n`;
  const fileDiff = processFile(patch, {
    cacheKey: `placeholder:${fileName}:${message}`,
    isGitDiff: true,
  });

  if (!fileDiff) {
    throw new Error(`Unable to create placeholder diff for ${fileName}`);
  }

  return fileDiff;
}

export function getAnnotationsKey(annotations: DiffLineAnnotation<DiffAnnotationItem>[]): string {
  return annotations
    .map((annotation) => {
      const type = (annotation.metadata as { type?: string } | undefined)?.type ?? "";
      return `${annotation.side}:${annotation.lineNumber}:${type}`;
    })
    .join("\u0001");
}

export function useParsedMultiFileDiffs<TTarget extends MultiDiffCodeViewTarget>(
  targetResults: MultiDiffTargetResult<TTarget>[],
  cacheSalt: string,
) {
  const [, forceUpdate] = useReducer((count: number) => count + 1, 0);

  const requests = targetResults
    .map(({ target, result }) => {
      if (!result.data) return null;
      const request = getParsedDiffRequest(
        target.path,
        result.data.oldFile,
        result.data.newFile,
        cacheSalt,
      );
      return request ? { target, request } : null;
    })
    .filter((request): request is NonNullable<typeof request> => request !== null);
  const requestKey = requests
    .map(({ target, request }) => `${target.id}:${request.key}`)
    .join("\u0001");

  useEffect(() => {
    let cancelled = false;
    const uncachedRequests = requests.filter(
      ({ request }) => peekCachedParsedDiff(request.key) === undefined,
    );

    if (uncachedRequests.length === 0) {
      if (requests.length > 0) {
        queueMicrotask(() => {
          if (!cancelled) forceUpdate();
        });
      }
    } else {
      void Promise.all(uncachedRequests.map(({ request }) => loadParsedDiff(request, "low"))).then(
        () => {
          if (!cancelled) forceUpdate();
        },
      );
    }

    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  return requests
    .map(({ target, request }) => {
      const parsedDiff = peekCachedParsedDiff(request.key);
      return parsedDiff ? { target, fileDiff: parsedDiff } : null;
    })
    .filter((entry): entry is ParsedMultiDiff<TTarget> => entry !== null);
}

export function useMultiDiffCodeViewOptions<TTarget extends MultiDiffCodeViewTarget, TSelection>({
  diffStyle,
  theme,
  themeType,
  expandUnchanged,
  activeItemId,
  targetById,
  diagnostics,
  onHoverTokenClick,
  onNavigationTokenClick,
  onSelectItem,
  buildSelection,
  setSelectedRange,
  setComposerRange,
}: UseMultiDiffCodeViewOptionsInput<TTarget, TSelection>) {
  const interactionRef = useRef<MultiDiffCodeViewInteraction<TTarget, TSelection>>({
    activeItemId,
    targetById,
    diagnostics,
    onHoverTokenClick,
    onNavigationTokenClick,
    onSelectItem,
    buildSelection,
    setSelectedRange,
    setComposerRange,
  });
  interactionRef.current = {
    activeItemId,
    targetById,
    diagnostics,
    onHoverTokenClick,
    onNavigationTokenClick,
    onSelectItem,
    buildSelection,
    setSelectedRange,
    setComposerRange,
  };

  return useMemo<CodeViewOptions<DiffAnnotationItem>>(
    () => ({
      diffStyle,
      layout: MULTI_DIFF_CODE_VIEW_LAYOUT,
      theme,
      themeType,
      unsafeCSS: MULTI_DIFF_CODE_VIEW_CSS,
      maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
      expansionLineCount: 20,
      expandUnchanged,
      enableLineSelection: true,
      enableGutterUtility: true,
      stickyHeaders: true,
      onLineClick: (_props, context) => {
        interactionRef.current.onSelectItem(context.item.id);
      },
      onLineNumberClick: (_props, context) => {
        interactionRef.current.onSelectItem(context.item.id);
      },
      onTokenClick: (props, event, context) => {
        const {
          activeItemId: currentActiveItemId,
          onHoverTokenClick: handleHoverTokenClick,
          onNavigationTokenClick: handleNavigationTokenClick,
          onSelectItem: handleSelectItem,
        } = interactionRef.current;

        if (context.item.id !== currentActiveItemId) {
          handleSelectItem(context.item.id);
          return;
        }

        const diffTokenProps = props as DiffTokenEventBaseProps;
        if (handleHoverTokenClick(diffTokenProps, event)) return;
        handleNavigationTokenClick(diffTokenProps, event);
      },
      onTokenEnter: (props, _event, context) => {
        interactionRef.current.diagnostics.onTokenEnter(
          context.item.id,
          props as DiffTokenEventBaseProps,
        );
      },
      onTokenLeave: () => {
        interactionRef.current.diagnostics.onTokenLeave();
      },
      onLineSelectionStart: (range, context) => {
        updateSelection(interactionRef.current, context.item.id, range, false);
      },
      onLineSelected: (range, context) => {
        updateSelection(interactionRef.current, context.item.id, range, true);
      },
      onLineSelectionChange: (range, context) => {
        updateSelection(interactionRef.current, context.item.id, range, false);
      },
      onLineSelectionEnd: (range, context) => {
        updateSelection(interactionRef.current, context.item.id, range, true);
      },
      onPostRender: (node, _instance, _phase, context) => {
        interactionRef.current.diagnostics.onPostRender(context.item.id, node);
      },
    }),
    [diffStyle, expandUnchanged, theme, themeType],
  );
}

function updateSelection<TTarget extends MultiDiffCodeViewTarget, TSelection>(
  interaction: MultiDiffCodeViewInteraction<TTarget, TSelection>,
  itemId: string,
  range: SelectionRange | null,
  showComposer: boolean,
) {
  const target = interaction.targetById.get(itemId);
  if (!range || !target) {
    interaction.setSelectedRange(null);
    interaction.setComposerRange(null);
    return;
  }

  interaction.onSelectItem(itemId);
  const selection = interaction.buildSelection({ itemId, target, range });
  interaction.setSelectedRange(selection);
  interaction.setComposerRange(showComposer ? selection : null);
}
