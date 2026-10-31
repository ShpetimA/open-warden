import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { selectActiveWorkspace, type Workspace } from "@/features/workspaces/workspacesSlice";
import { workspacePath } from "@/features/workspaces/workspaceRoutes";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { File as PierreFile, Virtualizer } from "@pierre/diffs/react";
import { ArrowLeft, GitCommitHorizontal } from "lucide-react";
import { useNavigate } from "react-router";
import { useTheme } from "next-themes";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { DIFF_LINE_FOCUS_CSS, useDiffLineFocus } from "@/features/source-control/diffLineFocus";
import { getDiffTheme, getDiffThemeType } from "@/features/diff-view/diffRenderConfig";
import { useGetRepoFileQuery } from "@/features/source-control/api";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { LspSymbolPeekContainer } from "@/features/lsp/components/LspSymbolPeek";
import { useLspTokenNavigation } from "@/features/lsp/useLspTokenNavigation";
import { navigateBackToDiffFromFileViewer } from "@/features/source-control/actions";
import { FileBlameGutter } from "@/features/source-control/components/FileBlameGutter";
import { makeFileCodeFocusable } from "../fileCodeAccessibility";
import { BLAME_LINE_HEIGHT, type BlameGroup } from "@/features/source-control/blameGroups";
import { WorkingFileControls, WorkingFileEditor } from "./WorkingFileEditor";
import { workingFileKey } from "../fileEditorSlice";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { DiffReturnTarget, FileViewerTarget } from "@/features/source-control/types";
import { getFileContentMetadata, getTextFile } from "@/platform/desktop/fileContent";
import { FileContentNotice } from "@/features/diff-view/components/FileContentNotice";
import { OpenInExternalEditor } from "./OpenInExternalEditor";

type GeneralFileViewerProps = {
  target?: FileViewerTarget | null;
};

const FILE_VIEWER_CSS = `
    :host {
      min-width: 0;
      max-width: 100%;
      --diffs-line-height: ${BLAME_LINE_HEIGHT}px;
      --diffs-gap-block: 0px;
    }

    [data-diffs-header] {
      position: sticky;
      top: 0;
      z-index: 10;
      background-color: var(--diffs-bg);
      border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
      min-width: 0;
      overflow: hidden;
    }

    pre[data-file-type='single'] {
      overflow: hidden;
      min-width: 0;
    }
    ${DIFF_LINE_FOCUS_CSS}
`;

function formatReturnToDiffLabel(target: DiffReturnTarget) {
  const lineLabel = `:${target.lineNumber}`;
  if (target.kind === "changes") {
    return `${target.path}${lineLabel} · Changes`;
  }
  if (target.kind === "review") {
    return `${target.path}${lineLabel} · Review`;
  }
  if (target.kind === "history" || target.kind === "history-range") {
    return `${target.path}${lineLabel} · History`;
  }
  return `${target.path}${lineLabel} · Pull Request`;
}

function returnToDiffPath(target: DiffReturnTarget, workspace: Workspace | null) {
  if (target.kind === "changes") return "/changes";
  if (target.kind === "review") return "/review";
  if (target.kind === "history" || target.kind === "history-range") return "/history";
  return workspace?.kind === "pull-request"
    ? workspacePath(workspace).replace(/overview$/, "local-files")
    : "/changes";
}

function countFileLines(contents: string) {
  if (contents.length === 0) {
    return 1;
  }

  let lines = 1;
  for (let index = 0; index < contents.length; index += 1) {
    if (contents[index] === "\n") {
      lines += 1;
    }
  }

  return lines;
}

export function GeneralFileViewer(props: GeneralFileViewerProps) {
  const navigate = useNavigate();
  const workspace = useAppSelector(selectActiveWorkspace);
  const dispatch = useAppDispatch();
  const { resolvedTheme } = useTheme();
  const reduxTarget = useAppSelector((state) => state.sourceControl.fileViewerTarget);
  const target = props.target ?? reduxTarget;
  const hasDraft = useAppSelector((state) => {
    const document =
      target && !target.revision ? state.fileEditor.documents[workingFileKey(target)] : null;
    return Boolean(document && document.contents !== document.baseContents);
  });
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const [showBlame, setShowBlame] = useState(Boolean(target?.blame));
  const [blameSelection, setBlameSelection] = useState<{
    targetKey: string;
    group: BlameGroup;
  } | null>(null);
  const blameTargetKey = `${target?.repoPath}:${target?.relPath}:${target?.revision ?? ""}`;
  const blameVisible = showBlame && !hasDraft;
  const selectedBlameGroup =
    blameVisible && blameSelection?.targetKey === blameTargetKey ? blameSelection.group : null;
  useEffect(() => {
    setShowBlame(Boolean(target?.blame));
  }, [target?.repoPath, target?.relPath, target?.revision, target?.blame]);
  const returnToDiffTarget = target?.returnToDiff ?? null;

  const repoFileQuery = useGetRepoFileQuery(
    target
      ? {
          repoPath: target.repoPath,
          relPath: target.relPath,
          revision: target.revision,
        }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const content = repoFileQuery.currentData;
  const file = getTextFile(content ?? null);
  const metadata = getFileContentMetadata(content ?? null);
  const errorMessage = content ? "" : errorMessageFrom(repoFileQuery.error, "");
  const selectedLine = target?.line && target.line > 0 ? target.line : null;
  const focusKey = target?.focusKey ?? null;
  const lspText = file?.contents ?? null;
  const lineCount = file ? countFileLines(file.contents) : null;
  const { onTokenClick } = useLspTokenNavigation(
    target ? { repoPath: target.repoPath, relPath: target.relPath } : undefined,
    {
      getReturnToDiffTarget: () => target?.returnToDiff ?? null,
    },
  );

  useDiffLineFocus({
    containerRef: viewerRef,
    lineNumber: file ? selectedLine : null,
    lineCount,
    focusKey,
    enabled: Boolean(file),
  });

  if (errorMessage) {
    return (
      <ErrorState
        title="Couldn’t open this file"
        error={repoFileQuery.error}
        busy={repoFileQuery.isFetching}
        recovery={{
          label: "Retry",
          onAction: () => {
            void repoFileQuery.refetch();
          },
        }}
      />
    );
  }

  if (repoFileQuery.isFetching && !content) {
    return <div className="text-muted-foreground p-4 text-sm">Loading file...</div>;
  }

  if (!content) {
    return <div className="text-muted-foreground p-4 text-sm">Select a file to view it.</div>;
  }

  let highlightedLines: ComponentProps<typeof PierreFile>["selectedLines"] = null;

  if (selectedLine) highlightedLines = { start: selectedLine, end: selectedLine };

  if (selectedBlameGroup) {
    highlightedLines = { start: selectedBlameGroup.line, end: selectedBlameGroup.endLine };
  }

  const fileProps = file
    ? ({
        file,
        className: "block min-w-0 flex-1",
        metrics: {
          lineHeight: BLAME_LINE_HEIGHT,
          hunkLineCount: 100,
          diffHeaderHeight: 0,
          spacing: 0,
          paddingTop: 0,
          paddingBottom: 0,
        },
        selectedLines: highlightedLines,
        options: {
          theme: getDiffTheme(),
          themeType: getDiffThemeType(resolvedTheme),
          unsafeCSS: FILE_VIEWER_CSS,
          disableLineNumbers: false,
          disableFileHeader: true,
          overflow: "scroll",
          onTokenClick,
          onPostRender: blameVisible ? makeFileCodeFocusable : undefined,
        },
      } satisfies ComponentProps<typeof PierreFile>)
    : null;

  return (
    <section className="relative flex h-full min-h-0 min-w-0 flex-col">
      {repoFileQuery.error ? (
        <ErrorNotice
          title="Couldn’t refresh this file"
          error={repoFileQuery.error}
          busy={repoFileQuery.isFetching}
          lastUpdated={repoFileQuery.fulfilledTimeStamp}
          recovery={{
            label: "Retry",
            onAction: () => {
              void repoFileQuery.refetch();
            },
          }}
        />
      ) : null}
      {target?.revision ? <ReadOnlyFileLspSync target={target} contents={lspText} /> : null}
      <div className="border-border/70 bg-surface-toolbar border-b px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-3">
          {returnToDiffTarget ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigate(returnToDiffPath(returnToDiffTarget, workspace));
                dispatch(navigateBackToDiffFromFileViewer());
              }}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to diff
            </Button>
          ) : null}
          <div
            className="text-muted-foreground min-w-0 flex-1 truncate text-xs"
            title={target?.relPath}
          >
            {returnToDiffTarget ? formatReturnToDiffLabel(returnToDiffTarget) : target?.relPath}
          </div>
          {target && !target.revision && file ? (
            <WorkingFileControls target={target} />
          ) : (
            <span className="text-muted-foreground shrink-0 text-[11px]">Read only</span>
          )}
          {target && file ? (
            <FileBlameButton
              target={target}
              shown={blameVisible}
              onToggle={() => {
                setBlameSelection(null);
                setShowBlame((value) => !value);
              }}
            />
          ) : null}
          {target &&
          !target.revision &&
          (metadata?.kind === "binary" ||
            metadata?.kind === "too-large" ||
            metadata?.kind === "image") ? (
            <OpenInExternalEditor
              repoPath={target.repoPath}
              filePath={target.relPath}
              target="file"
              compact
            />
          ) : null}
        </div>
      </div>
      {metadata ? (
        <FileContentNotice
          activePath={target?.relPath ?? content.name}
          notice={{ metadata }}
          oldFile={null}
          newFile={content}
          mode="file"
          hideHeader
        />
      ) : null}
      {file && fileProps ? (
        <div className="flex min-h-0 min-w-0 flex-1">
          <div
            key={file.name}
            ref={viewerRef}
            className="@container relative min-h-0 min-w-0 flex-1 overflow-hidden"
          >
            <Virtualizer
              className="file-viewer-scroll relative h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
              contentClassName="flex min-h-full min-w-0 items-start"
            >
              {blameVisible && target ? (
                <FileBlameGutter
                  key={`${target.repoPath}:${target.relPath}:${target.revision ?? ""}`}
                  target={target}
                  selectedGroup={selectedBlameGroup}
                  onSelectGroup={(group) =>
                    setBlameSelection(group ? { targetKey: blameTargetKey, group } : null)
                  }
                />
              ) : null}
              {target && !target.revision ? (
                <WorkingFileEditor
                  key={workingFileKey(target)}
                  {...fileProps}
                  target={target}
                  editing={!blameVisible}
                />
              ) : (
                <PierreFile key="source" {...fileProps} />
              )}
            </Virtualizer>
            <LspSymbolPeekContainer
              document={target ? { repoPath: target.repoPath, relPath: target.relPath } : undefined}
              containerRef={viewerRef}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReadOnlyFileLspSync({
  target,
  contents,
}: {
  target: FileViewerTarget;
  contents: string | null;
}) {
  useCurrentLspDocument(target.repoPath, target.relPath, contents);
  return null;
}

function FileBlameButton({
  target,
  shown,
  onToggle,
}: {
  target: FileViewerTarget;
  shown: boolean;
  onToggle: () => void;
}) {
  const dirty = useAppSelector((state) => {
    const document = state.fileEditor.documents[workingFileKey(target)];
    return !target.revision && Boolean(document && document.contents !== document.baseContents);
  });
  return (
    <TooltipProvider delayDuration={450} skipDelayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0">
            <Button
              size="xs"
              disabled={dirty}
              aria-pressed={shown}
              variant={shown ? "secondary" : "ghost"}
              onClick={onToggle}
            >
              <GitCommitHorizontal className="size-3.5" /> Blame
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {dirty
            ? "Save changes before showing line attribution"
            : "Show who last changed each line"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
