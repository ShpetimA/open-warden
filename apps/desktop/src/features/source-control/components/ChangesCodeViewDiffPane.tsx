import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import { CodeView, type CodeViewHandle, type CodeViewItem } from "@pierre/diffs/react";
import { type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useTheme } from "next-themes";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { DiagnosticTokenPopover } from "@/features/diff-view/components/DiagnosticTokenPopover";
import { DiffHeaderMetadataControls } from "@/features/diff-view/components/DiffHeaderMetadataControls";
import { CommentAnnotation } from "@/features/diff-view/components/CommentAnnotation";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import {
  DiffLspHoverPopover,
  type LspHoverDocument,
  useDiffLspHover,
} from "@/features/diff-view/useDiffLspHover";
import {
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from "@/features/diff-view/diffRenderConfig";
import { useDiffAnnotationRenderer } from "@/features/diff-view/hooks/useDiffAnnotationRenderer";
import {
  countFileLines,
  createPlaceholderDiff,
  getAnnotationsKey,
  getCodeViewItemNextVersion,
  MULTI_DIFF_SCROLLBAR_CSS,
  useMultiDiffCodeViewOptions,
  useParsedMultiFileDiffs,
} from "@/features/diff-view/hooks/useMultiDiffCodeViewOptions";
import { useMultiDiffDiagnostics } from "@/features/diff-view/hooks/useMultiDiffDiagnostics";
import {
  getParsedDiffRequest,
  peekCachedParsedDiff,
} from "@/features/diff-view/services/parsedDiffCache";
import { LspDiagnosticsSummaryNotice } from "@/features/lsp/components/LspStatusNotice";
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import { useCurrentLspDocuments } from "@/features/lsp/hooks/useCurrentLspDocument";
import { selectLspDiagnosticsForFile } from "@/features/lsp/selectors";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import { fileComments, toLineAnnotations } from "@/features/comments/actions";
import { useFirstCommentTip } from "@/features/comments/useFirstCommentTip";
import { gitApi } from "@/features/source-control/api";
import {
  buildUnifiedChangeTreeFiles,
  compareUnifiedChangeListEntries,
  compareUnifiedChangeTreeDirectories,
  compareUnifiedChangeTreeEntries,
} from "@/features/source-control/components/changesUnifiedPierreTree";
import { buildTreeOptions } from "@/features/source-control/components/pierreFileTree";
import { applyHunkToIndexAction, selectFile } from "@/features/source-control/actions";
import {
  buildSourceControlFileTree,
  type SourceControlTreeNode,
} from "@/features/source-control/fileTree";
import {
  buildIndexContentsForHunkOperation,
  type DiffHunkActionAnnotation,
  type DiffHunkActionPayload,
  type DiffHunkOperation,
} from "@/features/source-control/hunkOperations";
import { useDiffLineFocus } from "@/features/source-control/diffLineFocus";
import type {
  Bucket,
  BucketedFile,
  CommentContext,
  DiffAnnotationItem,
  DiffReturnTarget,
  FileBrowserMode,
  FileItem,
  GitSnapshot,
  SelectionRange,
} from "@/features/source-control/types";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

const COMMENT_CONTEXT: CommentContext = { kind: "changes" };

type ChangesDiffTarget = BucketedFile & {
  id: string;
};

type FileVersionResult = ReturnType<ReturnType<typeof gitApi.endpoints.getFileVersions.select>>;

type TargetResult = {
  target: ChangesDiffTarget;
  result: FileVersionResult;
};

type SelectedDiffRange = {
  itemId: string;
  path: string;
  bucket: Bucket;
  range: SelectionRange;
};

type LoadedCodeViewItemState = {
  annotations: DiffLineAnnotation<DiffAnnotationItem>[];
  fileDiff: FileDiffMetadata;
  annotationsKey: string;
};

type Props = {
  activeRepo: string;
  snapshot: GitSnapshot;
};

function toBucketedFile(file: FileItem, bucket: Bucket) {
  return {
    path: file.path,
    previousPath: file.previousPath,
    status: file.status,
    bucket,
  } satisfies BucketedFile;
}

function changesDiffItemId(bucket: Bucket, path: string) {
  return `${bucket}\u0000${path}`;
}

function hunkOperationsForBucket(bucket: Bucket): DiffHunkOperation[] {
  if (bucket === "unstaged") return ["stage", "discard"];
  if (bucket === "staged") return ["unstage"];
  return [];
}

function buildReturnToDiffTarget(
  activeRepo: string,
  target: ChangesDiffTarget | null,
  source: { lineNumber: number; lineIndex: string | null },
): DiffReturnTarget | null {
  if (!activeRepo || !target || source.lineNumber <= 0) return null;

  return {
    kind: "changes",
    repoPath: activeRepo,
    path: target.path,
    bucket: target.bucket,
    lineNumber: source.lineNumber,
    lineIndex: source.lineIndex,
  };
}

function collectTreeFiles<TFile>(nodes: ReadonlyArray<SourceControlTreeNode<TFile>>): TFile[] {
  const files: TFile[] = [];

  for (const node of nodes) {
    if (node.kind === "file") {
      files.push(node.file);
      continue;
    }

    files.push(...collectTreeFiles(node.children));
  }

  return files;
}

function buildChangeTargets(snapshot: GitSnapshot, mode: FileBrowserMode) {
  const stagedRows = snapshot.staged
    .filter((file) => file.status !== "unmerged")
    .map((file) => toBucketedFile(file, "staged"));
  const changedRows = [
    ...snapshot.unstaged
      .filter((file) => file.status !== "unmerged")
      .map((file) => toBucketedFile(file, "unstaged")),
    ...snapshot.untracked.map((file) => toBucketedFile(file, "untracked")),
  ];
  const unifiedFiles = buildUnifiedChangeTreeFiles(stagedRows, changedRows, [], mode);
  const sort = mode === "list" ? compareUnifiedChangeListEntries : compareUnifiedChangeTreeEntries;
  const orderedFiles = collectTreeFiles(
    buildSourceControlFileTree(
      unifiedFiles,
      buildTreeOptions(compareUnifiedChangeTreeDirectories, false, sort),
    ),
  );

  return orderedFiles.map((file) => ({
    ...file,
    path: file.realPath,
    id: changesDiffItemId(file.bucket, file.realPath),
  }));
}

function useEnsureFileVersionQueries(activeRepo: string, targets: ChangesDiffTarget[]) {
  const dispatch = useAppDispatch();
  const targetKey = targets.map((target) => target.id).join("\u0001");

  useEffect(() => {
    if (!activeRepo || targets.length === 0) return;

    const subscriptions = targets.map((target) =>
      dispatch(
        gitApi.endpoints.getFileVersions.initiate(
          { repoPath: activeRepo, bucket: target.bucket, relPath: target.path },
          {
            subscriptionOptions: {
              refetchOnFocus: true,
              refetchOnReconnect: true,
            },
          },
        ),
      ),
    );

    return () => {
      for (const subscription of subscriptions) {
        subscription.unsubscribe();
      }
    };
  }, [activeRepo, dispatch, targetKey, targets]);
}

function useFileVersionResults(activeRepo: string, targets: ChangesDiffTarget[]) {
  const queryResults = useAppSelector(
    (state) =>
      targets.map((target) =>
        gitApi.endpoints.getFileVersions.select({
          repoPath: activeRepo,
          bucket: target.bucket,
          relPath: target.path,
        })(state),
      ),
    shallowEqual,
  );

  return targets.map(
    (target, index): TargetResult => ({
      target,
      result: queryResults[index],
    }),
  );
}

function buildHunkActionAnnotations(
  fileDiff: FileDiffMetadata,
  target: ChangesDiffTarget,
  diffStyle: "split" | "unified",
  onHunkAction: (
    target: ChangesDiffTarget,
    operation: DiffHunkOperation,
    payload: DiffHunkActionPayload,
  ) => void,
): DiffLineAnnotation<DiffAnnotationItem>[] {
  const operations = hunkOperationsForBucket(target.bucket);
  if (operations.length === 0) return [];

  return fileDiff.hunks.map((hunk, hunkIndex) => {
    let additionOffset = 0;
    let deletionOffset = 0;

    for (const content of hunk.hunkContent) {
      if (content.type === "context") {
        additionOffset += content.lines;
        deletionOffset += content.lines;
        continue;
      }

      const side = content.additions > 0 ? "additions" : "deletions";
      const firstChangedLine =
        side === "additions"
          ? hunk.additionStart + additionOffset
          : hunk.deletionStart + deletionOffset;
      const hunkStartLine = side === "additions" ? hunk.additionStart : hunk.deletionStart;

      // In split mode, place the button on the first actual changed line rather
      // than the context line above it. Shared context rows are estimated by the
      // virtualizer as plain text lines; injecting an annotation into only one
      // column causes a height mismatch and scroll jump when the row is measured.
      // Changed rows are already asymmetric, so the estimate is closer.
      const lineNumber =
        diffStyle === "split"
          ? firstChangedLine
          : firstChangedLine > hunkStartLine
            ? firstChangedLine - 1
            : firstChangedLine;

      const metadata: DiffHunkActionAnnotation = {
        type: "hunk-action",
        operations,
        fileDiff,
        hunkIndex,
        onAction: (operation, payload) => onHunkAction(target, operation, payload),
      };

      return { side, lineNumber, metadata };
    }

    const metadata: DiffHunkActionAnnotation = {
      type: "hunk-action",
      operations,
      fileDiff,
      hunkIndex,
      onAction: (operation, payload) => onHunkAction(target, operation, payload),
    };
    return { side: "additions", lineNumber: hunk.additionStart, metadata };
  });
}

export function ChangesCodeViewDiffPane({ activeRepo, snapshot }: Props) {
  const dispatch = useAppDispatch();
  const { resolvedTheme } = useTheme();
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const diffFocusTarget = useAppSelector((state) => state.sourceControl.diffFocusTarget);
  const comments = useAppSelector((state) => state.comments);
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const [selectedRange, setSelectedRange] = useState<SelectedDiffRange | null>(null);
  const [composerRange, setComposerRange] = useState<SelectedDiffRange | null>(null);
  const codeViewRef = useRef<CodeViewHandle<DiffAnnotationItem> | null>(null);
  const loadedItemsRef = useRef(new Map<string, LoadedCodeViewItemState>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const skipNextActiveScrollRef = useRef(false);
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType);
  const diffTheme = useMemo(() => getDiffTheme(), []);
  const targets = useMemo(
    () => buildChangeTargets(snapshot, fileBrowserMode),
    [fileBrowserMode, snapshot],
  );
  const targetKey = targets.map((target) => target.id).join("\u0001");
  const codeViewKey = `${targetKey}\u0001${expandUnchanged ? "expanded" : "collapsed"}`;
  const activeTarget =
    targets.find((target) => target.bucket === activeBucket && target.path === activePath) ?? null;
  const activeItemId = activeTarget?.id ?? null;

  useEnsureFileVersionQueries(activeRepo, targets);
  const targetResults = useFileVersionResults(activeRepo, targets);
  const parsedDiffs = useParsedMultiFileDiffs(targetResults, diffThemeCacheSalt);

  const activeResult = targetResults.find((entry) => entry.target.id === activeItemId)?.result;
  const activeFileVersions = activeResult?.data ?? null;
  const activeNewFile = activeFileVersions?.newFile ?? null;
  const activeLineCount = countFileLines(activeNewFile);
  const activeErrorMessage = activeResult?.error ? errorMessageFrom(activeResult.error, "") : "";
  const isLoadingInitialDiffs =
    targets.length > 0 &&
    parsedDiffs.length === 0 &&
    targetResults.some(
      ({ result }) => result.status === "pending" || result.status === "uninitialized",
    );

  const lspText = activeNewFile?.contents ?? null;
  const lspHoverDocument: LspHoverDocument | undefined =
    activeTarget && lspText !== null
      ? { repoPath: activeRepo, relPath: activeTarget.path }
      : undefined;
  const lspDocuments = useMemo(
    () =>
      targetResults
        .map(({ target, result }) =>
          result.data?.newFile
            ? {
                repoPath: activeRepo,
                relPath: target.path,
                text: result.data.newFile.contents,
              }
            : null,
        )
        .filter((document): document is { repoPath: string; relPath: string; text: string } =>
          Boolean(document),
        ),
    [activeRepo, targetResults],
  );
  useCurrentLspDocuments(lspDocuments);

  const diagnosticResults = useAppSelector(
    (state) => targets.map((target) => selectLspDiagnosticsForFile(state, activeRepo, target.path)),
    shallowEqual,
  );
  const diagnosticsByItem = useMemo(
    () =>
      new Map(targets.map((target, index) => [target.id, diagnosticResults[index] ?? []] as const)),
    [diagnosticResults, targets],
  );
  const diagnostics = useMultiDiffDiagnostics(diagnosticsByItem);
  const isLoadingLspDocuments = targetResults.some(
    ({ result }) => result.status === "pending" || result.status === "uninitialized",
  );

  const lspResetKey = activeItemId ?? "";
  const {
    hoverState,
    onTokenClick: onHoverTokenClick,
    popoverRef,
  } = useDiffLspHover({
    document: lspHoverDocument,
    resetKey: lspResetKey,
  });
  const { onTokenClick: onNavigationTokenClick } = useLspTokenNavigation(lspHoverDocument, {
    getReturnToDiffTarget: (source) => buildReturnToDiffTarget(activeRepo, activeTarget, source),
  });

  const { showFirstCommentTip } = useFirstCommentTip();
  const repoCommentCount = comments.filter((comment) => comment.repoPath === activeRepo).length;

  const focusedLineNumber =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === activePath
      ? diffFocusTarget.lineNumber
      : null;
  const focusedLineIndex =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === activePath
      ? diffFocusTarget.lineIndex
      : null;
  const focusedLineKey =
    diffFocusTarget?.kind === "changes" && diffFocusTarget.path === activePath
      ? diffFocusTarget.focusKey
      : null;

  useDiffLineFocus({
    containerRef: viewportRef,
    lineNumber: focusedLineNumber,
    lineIndex: focusedLineIndex,
    lineCount: activeLineCount,
    focusKey: focusedLineKey,
    enabled: Boolean(activeItemId),
  });

  useEffect(() => {
    if (!activeItemId || !codeViewRef.current?.getItem(activeItemId)) return;

    if (skipNextActiveScrollRef.current) {
      skipNextActiveScrollRef.current = false;
      return;
    }

    codeViewRef.current.scrollTo({
      type: "item",
      id: activeItemId,
      align: "start",
      behavior: "instant",
    });
  }, [activeItemId, codeViewKey]);

  // -------------------------------------------------------------------------
  // Hunk actions
  // -------------------------------------------------------------------------
  const handleHunkAction = useCallback(
    (target: ChangesDiffTarget, operation: DiffHunkOperation, payload: DiffHunkActionPayload) => {
      const contents = buildIndexContentsForHunkOperation({
        fileDiff: payload.fileDiff,
        hunkIndex: payload.hunkIndex,
        operation,
      });

      void dispatch(
        applyHunkToIndexAction({
          filePath: target.path,
          contents,
          operation,
        }),
      );
    },
    [dispatch],
  );

  // -------------------------------------------------------------------------
  // Build per-item annotations
  // -------------------------------------------------------------------------
  const commentsByPath = useMemo(() => {
    const next = new Map<string, ReturnType<typeof toLineAnnotations>>();
    for (const target of targets) {
      next.set(
        target.id,
        toLineAnnotations(fileComments(comments, activeRepo, target.path, COMMENT_CONTEXT)),
      );
    }
    return next;
  }, [activeRepo, comments, targets]);

  const annotationEntries = useMemo(
    () =>
      parsedDiffs.map(({ target, fileDiff }) => {
        const commentAnnotations = commentsByPath.get(target.id) ?? [];
        const composerAnnotation: DiffLineAnnotation<DiffAnnotationItem>[] =
          composerRange?.itemId === target.id
            ? [
                {
                  lineNumber: composerRange.range.end,
                  metadata: {
                    type: "composer",
                    side: composerRange.range.side ?? "deletions",
                    endSide: composerRange.range.endSide,
                    startLine: composerRange.range.start,
                    endLine: composerRange.range.end,
                  },
                  side: composerRange.range.side ?? "deletions",
                },
              ]
            : [];
        return {
          id: target.id,
          annotations: [
            ...buildHunkActionAnnotations(fileDiff, target, diffStyle, handleHunkAction),
            ...commentAnnotations,
            ...composerAnnotation,
          ],
        };
      }),
    [commentsByPath, composerRange, diffStyle, handleHunkAction, parsedDiffs],
  );
  const annotationsById = useMemo(
    () => new Map(annotationEntries.map((entry) => [entry.id, entry.annotations])),
    [annotationEntries],
  );

  useEffect(() => {
    loadedItemsRef.current.clear();
  }, [codeViewKey]);

  useEffect(() => {
    const viewer = codeViewRef.current;
    if (!viewer) return;

    for (const target of targets) {
      if (viewer.getItem(target.id)) continue;

      const annotations = annotationsById.get(target.id) ?? [];
      const fileDiff = createPlaceholderDiff(target.path, "Loading diff...");
      viewer.addItems([
        {
          id: target.id,
          type: "diff",
          fileDiff,
          annotations,
          version: 0,
        },
      ]);
      loadedItemsRef.current.set(target.id, {
        annotations,
        fileDiff,
        annotationsKey: getAnnotationsKey(annotations),
      });
    }

    for (const target of targets) {
      const result = targetResults.find((entry) => entry.target.id === target.id)?.result;
      const request = result?.data
        ? getParsedDiffRequest(
            target.path,
            result.data.oldFile,
            result.data.newFile,
            diffThemeCacheSalt,
          )
        : null;
      const parsedDiff = request ? peekCachedParsedDiff(request.key) : undefined;
      const fileDiff =
        parsedDiff ??
        (result?.status === "rejected" || (result?.data && (!request || parsedDiff === null))
          ? createPlaceholderDiff(target.path, "Diff unavailable. This file may be binary.")
          : null);
      if (!fileDiff) continue;

      const annotations = annotationsById.get(target.id) ?? [];
      const annotationsKey = getAnnotationsKey(annotations);
      const loadedItem = loadedItemsRef.current.get(target.id);
      const viewerItem = viewer.getItem(target.id);
      if (
        !viewerItem ||
        viewerItem.type !== "diff" ||
        (loadedItem?.fileDiff === fileDiff && loadedItem.annotationsKey === annotationsKey)
      ) {
        continue;
      }

      viewerItem.fileDiff = fileDiff;
      viewerItem.annotations = annotations;
      viewerItem.version = getCodeViewItemNextVersion(viewerItem);
      if (viewer.updateItem(viewerItem)) {
        loadedItemsRef.current.set(target.id, { annotations, fileDiff, annotationsKey });
      }
    }
  }, [annotationsById, diffThemeCacheSalt, parsedDiffs, targetResults, targets]);

  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );

  const handleSelectItem = useCallback(
    (itemId: string) => {
      const target = targetById.get(itemId);
      if (!target) return;
      if (target.bucket === activeBucket && target.path === activePath) return;
      skipNextActiveScrollRef.current = true;
      void dispatch(selectFile(target.bucket, target.path));
    },
    [activeBucket, activePath, dispatch, targetById],
  );

  const options = useMultiDiffCodeViewOptions({
    diffStyle,
    theme: diffTheme,
    themeType: diffThemeType,
    expandUnchanged,
    activeItemId,
    targetById,
    diagnostics,
    onHoverTokenClick,
    onNavigationTokenClick,
    onSelectItem: handleSelectItem,
    buildSelection: ({ itemId, target, range }) => ({
      itemId,
      path: target.path,
      bucket: target.bucket,
      range,
    }),
    setSelectedRange,
    setComposerRange,
  });

  const selectedLines = selectedRange
    ? { id: selectedRange.itemId, range: selectedRange.range }
    : null;

  const parsedDiffById = useMemo(
    () => new Map(parsedDiffs.map(({ target, fileDiff }) => [target.id, fileDiff])),
    [parsedDiffs],
  );
  const initialCodeViewItems = useMemo<CodeViewItem<DiffAnnotationItem>[]>(
    () =>
      targets.map((target) => ({
        id: target.id,
        type: "diff",
        fileDiff:
          parsedDiffById.get(target.id) ?? createPlaceholderDiff(target.path, "Loading diff..."),
        annotations: annotationsById.get(target.id) ?? [],
        version: 0,
      })),
    [annotationsById, parsedDiffById, targets],
  );

  const renderAnnotation = useDiffAnnotationRenderer({
    "hunk-action": (data: DiffHunkActionAnnotation) => {
      const actionMeta = {
        stage: { label: "Stage hunk", Icon: Plus },
        unstage: { label: "Unstage hunk", Icon: Minus },
        discard: { label: "Discard hunk", Icon: Trash2 },
      } as const;

      return (
        <div className="flex justify-end gap-1 px-2 py-0">
          {data.operations.map((operation) => {
            const { label, Icon } = actionMeta[operation];

            return (
              <button
                key={operation}
                type="button"
                title={label}
                aria-label={label}
                className="inline-flex h-5 w-5 items-center justify-center rounded-xs border border-border/60 bg-background/90 text-muted-foreground shadow-sm transition-[background-color,color,scale] hover:bg-surface-1 hover:text-foreground active:scale-[0.96]"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  data.onAction(operation, {
                    fileDiff: data.fileDiff,
                    hunkIndex: data.hunkIndex,
                  });
                }}
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      );
    },
    composer: () => {
      if (!composerRange) return null;
      return (
        <CommentComposer
          visible
          activePath={composerRange.path}
          selectedRange={composerRange.range}
          commentContext={COMMENT_CONTEXT}
          onClose={() => {
            setSelectedRange(null);
            setComposerRange(null);
          }}
          onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
        />
      );
    },
    annotation: (data) => <CommentAnnotation comment={data} />,
  });

  const renderHeaderMetadata = useCallback(
    (item: CodeViewItem<DiffAnnotationItem>) => {
      const target = targetById.get(item.id);
      if (!target) return null;

      return (
        <DiffHeaderMetadataControls
          activePath={target.path}
          canComment
          commentContext={COMMENT_CONTEXT}
          expandUnchanged={expandUnchanged}
          fileViewerRevision={null}
          enableCopyHotkey={target.id === activeItemId}
          onToggleExpandUnchanged={() => setExpandUnchanged((previous) => !previous)}
        />
      );
    },
    [activeItemId, expandUnchanged, targetById],
  );

  if (targets.length === 0) {
    return <div className="text-muted-foreground p-3 text-sm">No changed files.</div>;
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col">
      <style>{MULTI_DIFF_SCROLLBAR_CSS}</style>
      <DiagnosticTokenPopover
        open={diagnostics.popoverState.open}
        anchorRect={diagnostics.popoverState.anchorRect}
        diagnostics={diagnostics.popoverState.diagnostics}
        {...diagnostics.popoverHandlers}
      />
      <DiffLspHoverPopover hoverState={hoverState} popoverRef={popoverRef} />
      <LspDiagnosticsSummaryNotice
        documents={lspDocuments}
        active={Boolean(activeTarget)}
        isLoading={isLoadingLspDocuments}
      />
      {activeErrorMessage ? (
        <div className="text-destructive p-3 text-sm">{activeErrorMessage}</div>
      ) : null}
      {isLoadingInitialDiffs ? (
        <div className="text-muted-foreground p-3 text-sm">Loading diffs...</div>
      ) : parsedDiffs.length === 0 ? (
        <div className="text-muted-foreground p-3 text-sm">No renderable diff content.</div>
      ) : null}
      <div className="relative min-h-0 min-w-0 flex-1">
        <CodeView
          key={codeViewKey}
          ref={codeViewRef}
          containerRef={viewportRef}
          className="diff-viewport-scroll relative h-full min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain pr-3 [contain:strict] [overflow-anchor:none] [will-change:scroll-position] [&_diffs-container]:overflow-clip [&_diffs-container]:[contain:layout_paint_style]"
          initialItems={initialCodeViewItems}
          selectedLines={selectedLines}
          options={options}
          renderAnnotation={renderAnnotation}
          renderHeaderMetadata={renderHeaderMetadata}
        />
        <LspSymbolPeekContainer document={lspHoverDocument} containerRef={viewportRef} />
      </div>
    </div>
  );
}
