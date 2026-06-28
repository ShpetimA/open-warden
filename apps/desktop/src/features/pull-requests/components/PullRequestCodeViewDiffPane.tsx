import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallowEqual } from "react-redux";
import { CodeView, type CodeViewHandle, type CodeViewItem } from "@pierre/diffs/react";
import { type DiffLineAnnotation, type FileDiffMetadata } from "@pierre/diffs";
import { useTheme } from "next-themes";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { CommentAnnotation } from "@/features/diff-view/components/CommentAnnotation";
import { CommentComposer } from "@/features/diff-view/components/CommentComposer";
import { DiagnosticTokenPopover } from "@/features/diff-view/components/DiagnosticTokenPopover";
import {
  buildMultiDiffScrollbarMarkers,
  DiffScrollbarMarkers,
} from "@/features/diff-view/components/DiffScrollbarMarkers";
import { DiffHeaderMetadataControls } from "@/features/diff-view/components/DiffHeaderMetadataControls";
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
import {
  DiffLspHoverPopover,
  type LspHoverDocument,
  useDiffLspHover,
} from "@/features/diff-view/useDiffLspHover";
import { LspDiagnosticsSummaryNotice } from "@/features/lsp/components/LspStatusNotice";
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import { useCurrentLspDocuments } from "@/features/lsp/hooks/useCurrentLspDocument";
import { selectLspDiagnosticsForFile } from "@/features/lsp/selectors";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import { usePullRequestMentionCandidates } from "@/features/pull-requests/hooks/usePullRequestMentionCandidates";
import { usePullRequestReviewAnchors } from "@/features/pull-requests/hooks/usePullRequestReviewAnchors";
import { PullRequestInlineAnchorAnnotation } from "@/features/pull-requests/components/PullRequestInlineAnchorAnnotation";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import { buildPullRequestAnchorAnnotations } from "@/features/pull-requests/utils/reviewAnchors";
import { gitApi } from "@/features/source-control/api";
import {
  buildSourceControlFileTree,
  type SourceControlTreeNode,
} from "@/features/source-control/fileTree";
import { useDiffLineFocus } from "@/features/source-control/diffLineFocus";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type {
  CommentContext,
  DiffAnnotationItem,
  DiffReturnTarget,
  FileBrowserMode,
  FileItem,
  SelectionRange,
} from "@/features/source-control/types";
import type { GitProviderId, PullRequestConversation } from "@/platform/desktop";

type ReviewDiffTarget = FileItem & {
  id: string;
};

type BranchVersionResult = ReturnType<
  ReturnType<typeof gitApi.endpoints.getBranchFileVersions.select>
>;

type TargetResult = {
  target: ReviewDiffTarget;
  result: BranchVersionResult;
};

type SelectedDiffRange = {
  itemId: string;
  path: string;
  range: SelectionRange;
};

type LoadedCodeViewItemState = {
  annotations: DiffLineAnnotation<DiffAnnotationItem>[];
  fileDiff: FileDiffMetadata;
  annotationsKey: string;
};

type Props = {
  activeRepo: string;
  reviewRepoPath: string;
  reviewProviderId?: GitProviderId;
  pullRequestNumber: number;
  reviewBaseRef: string;
  reviewHeadRef: string;
  readyForDiff: boolean;
  branchFiles: FileItem[];
  activePath: string;
  onSelectPath: (path: string) => void;
  conversation: PullRequestConversation | null;
  focusedLineNumber: number | null;
  focusedLineIndex: string | null;
  focusedLineKey: number | null;
};

function reviewDiffItemId(path: string) {
  return path;
}

function buildReturnToDiffTarget(
  activeRepo: string,
  target: ReviewDiffTarget | null,
  source: { lineNumber: number; lineIndex: string | null },
): DiffReturnTarget | null {
  if (!activeRepo || !target || source.lineNumber <= 0) return null;

  return {
    kind: "pull-request",
    repoPath: activeRepo,
    path: target.path,
    lineNumber: source.lineNumber,
    lineIndex: source.lineIndex,
  };
}

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: "base",
};

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

function orderFilesLikeFileList(files: FileItem[], mode: FileBrowserMode) {
  if (mode === "list") {
    return files.toSorted((left, right) =>
      left.path.localeCompare(right.path, undefined, SORT_LOCALE_OPTIONS),
    );
  }

  return collectTreeFiles(buildSourceControlFileTree(files));
}

function buildReviewTargets(files: FileItem[], mode: FileBrowserMode) {
  return orderFilesLikeFileList(files, mode).map((file) => ({
    ...file,
    id: reviewDiffItemId(file.path),
  }));
}

function useEnsureBranchFileVersionQueries({
  activeRepo,
  baseRef,
  headRef,
  readyForDiff,
  targets,
}: {
  activeRepo: string;
  baseRef: string;
  headRef: string;
  readyForDiff: boolean;
  targets: ReviewDiffTarget[];
}) {
  const dispatch = useAppDispatch();
  const targetKey = targets.map((target) => target.id).join("\u0001");

  useEffect(() => {
    if (!readyForDiff || !activeRepo || !baseRef || !headRef || targets.length === 0) return;

    const subscriptions = targets.map((target) =>
      dispatch(
        gitApi.endpoints.getBranchFileVersions.initiate(
          {
            repoPath: activeRepo,
            baseRef,
            headRef,
            relPath: target.path,
            previousPath: target.previousPath ?? undefined,
          },
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
  }, [activeRepo, baseRef, dispatch, headRef, readyForDiff, targetKey, targets]);
}

function useBranchFileVersionResults({
  activeRepo,
  baseRef,
  headRef,
  targets,
}: {
  activeRepo: string;
  baseRef: string;
  headRef: string;
  targets: ReviewDiffTarget[];
}) {
  const queryResults = useAppSelector(
    (state) =>
      targets.map((target) =>
        gitApi.endpoints.getBranchFileVersions.select({
          repoPath: activeRepo,
          baseRef,
          headRef,
          relPath: target.path,
          previousPath: target.previousPath ?? undefined,
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

export function PullRequestCodeViewDiffPane({
  activeRepo,
  reviewRepoPath,
  reviewProviderId,
  pullRequestNumber,
  reviewBaseRef,
  reviewHeadRef,
  readyForDiff,
  branchFiles,
  activePath,
  onSelectPath,
  conversation,
  focusedLineNumber,
  focusedLineIndex,
  focusedLineKey,
}: Props) {
  const { resolvedTheme } = useTheme();
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle);
  const fileBrowserMode = useAppSelector(
    (state) => state.settings.appSettings.sourceControl.fileTreeRenderMode,
  );
  const [expandUnchanged, setExpandUnchanged] = useState(false);
  const [selectedRange, setSelectedRange] = useState<SelectedDiffRange | null>(null);
  const [composerRange, setComposerRange] = useState<SelectedDiffRange | null>(null);
  const codeViewRef = useRef<CodeViewHandle<DiffAnnotationItem> | null>(null);
  const loadedItemsRef = useRef(new Map<string, LoadedCodeViewItemState>());
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const skipNextActiveScrollRef = useRef(false);
  const commentContext: CommentContext = useMemo(
    () => ({ kind: "review", baseRef: reviewBaseRef, headRef: reviewHeadRef }),
    [reviewBaseRef, reviewHeadRef],
  );
  const diffThemeType = getDiffThemeType(resolvedTheme);
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType);
  const diffTheme = useMemo(() => getDiffTheme(), []);
  const targets = useMemo(
    () => buildReviewTargets(branchFiles, fileBrowserMode),
    [branchFiles, fileBrowserMode],
  );
  const targetKey = targets.map((target) => target.id).join("\u0001");
  const codeViewKey = `${targetKey}\u0001${expandUnchanged ? "expanded" : "collapsed"}`;
  const activeTarget = targets.find((target) => target.path === activePath) ?? null;
  const activeItemId = activeTarget?.id ?? null;
  const commentMentions = usePullRequestMentionCandidates(conversation);
  const { anchorsByFile } = usePullRequestReviewAnchors({
    repoPath: reviewRepoPath,
    compareBaseRef: reviewBaseRef,
    compareHeadRef: reviewHeadRef,
    files: branchFiles,
    reviewThreads: conversation?.reviewThreads ?? [],
  });

  useEnsureBranchFileVersionQueries({
    activeRepo,
    baseRef: reviewBaseRef,
    headRef: reviewHeadRef,
    readyForDiff,
    targets,
  });
  const targetResults = useBranchFileVersionResults({
    activeRepo,
    baseRef: reviewBaseRef,
    headRef: reviewHeadRef,
    targets,
  });
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
  const scrollbarMarkers = useMemo(
    () =>
      buildMultiDiffScrollbarMarkers(
        parsedDiffs.map(({ target, fileDiff }) => ({ id: target.id, fileDiff })),
        diffStyle,
      ),
    [diffStyle, parsedDiffs],
  );
  const isLoadingLspDocuments = targetResults.some(
    ({ result }) => result.status === "pending" || result.status === "uninitialized",
  );
  const {
    hoverState,
    onTokenClick: onHoverTokenClick,
    popoverRef,
  } = useDiffLspHover({
    document: lspHoverDocument,
    resetKey: activeItemId ?? "",
  });
  const { onTokenClick: onNavigationTokenClick } = useLspTokenNavigation(lspHoverDocument, {
    getReturnToDiffTarget: (source) => buildReturnToDiffTarget(activeRepo, activeTarget, source),
  });

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

    if (focusedLineNumber) {
      codeViewRef.current.scrollTo({
        type: "line",
        id: activeItemId,
        lineNumber: focusedLineNumber,
        side: "additions",
        align: "center",
        behavior: "instant",
      });
      return;
    }

    codeViewRef.current.scrollTo({
      type: "item",
      id: activeItemId,
      align: "start",
      behavior: "instant",
    });
  }, [activeItemId, codeViewKey, focusedLineNumber, parsedDiffs.length]);

  const annotationEntries = useMemo(
    () =>
      parsedDiffs.map(({ target }) => {
        const anchorAnnotations = buildPullRequestAnchorAnnotations({
          anchors: anchorsByFile[target.path] ?? [],
          repoPath: reviewRepoPath,
          pullRequestNumber,
          compareBaseRef: reviewBaseRef,
          compareHeadRef: reviewHeadRef,
          providerId: reviewProviderId,
        });
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
          annotations: [...anchorAnnotations, ...composerAnnotation],
        };
      }),
    [
      anchorsByFile,
      parsedDiffs,
      pullRequestNumber,
      reviewBaseRef,
      reviewHeadRef,
      reviewProviderId,
      reviewRepoPath,
      composerRange,
    ],
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

  const targetById = useMemo(
    () => new Map(targets.map((target) => [target.id, target])),
    [targets],
  );

  const handleSelectItem = useCallback(
    (itemId: string) => {
      const target = targetById.get(itemId);
      if (!target) return;
      if (target.path === activePath) return;
      skipNextActiveScrollRef.current = true;
      onSelectPath(target.path);
    },
    [activePath, onSelectPath, targetById],
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
      range,
    }),
    setSelectedRange,
    setComposerRange,
  });

  const renderAnnotation = useDiffAnnotationRenderer({
    composer: () => {
      if (!composerRange) return null;
      return (
        <CommentComposer
          visible
          activePath={composerRange.path}
          selectedRange={composerRange.range}
          commentContext={commentContext}
          onClose={() => {
            setSelectedRange(null);
            setComposerRange(null);
          }}
          mentions={commentMentions}
        />
      );
    },
    "pull-request-anchor": (data) => (
      <PullRequestInlineAnchorAnnotation
        providerId={data.providerId}
        repoPath={data.repoPath}
        pullRequestNumber={data.pullRequestNumber}
        anchor={data.anchor}
        compareBaseRef={data.compareBaseRef}
        compareHeadRef={data.compareHeadRef}
        mentions={commentMentions}
      />
    ),
    "pull-request-thread": (data) => (
      <PullRequestInlineReviewThread
        repoPath={data.repoPath}
        pullRequestNumber={data.pullRequestNumber}
        thread={data.thread}
        mentions={commentMentions}
      />
    ),
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
          commentContext={commentContext}
          expandUnchanged={expandUnchanged}
          fileViewerRevision={reviewHeadRef}
          enableCopyHotkey={target.id === activeItemId}
          onToggleExpandUnchanged={() => setExpandUnchanged((previous) => !previous)}
        />
      );
    },
    [activeItemId, commentContext, expandUnchanged, reviewHeadRef, targetById],
  );

  if (!activePath) {
    return <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>;
  }

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-col" key="pr-code-viewer">
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
        <DiffScrollbarMarkers markers={scrollbarMarkers} viewportRef={viewportRef} />
        <LspSymbolPeekContainer document={lspHoverDocument} containerRef={viewportRef} />
      </div>
    </div>
  );
}
