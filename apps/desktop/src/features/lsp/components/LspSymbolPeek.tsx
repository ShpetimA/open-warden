import { useDeferredValue, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { skipToken } from "@reduxjs/toolkit/query";
import { File as PierreFile } from "@pierre/diffs/react";
import { Search, X } from "lucide-react";
import { useTheme } from "next-themes";
import { shallowEqual } from "react-redux";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { getDiffTheme, getDiffThemeType } from "@/features/diff-view/diffRenderConfig";
import { gitApi, useGetRepoFileQuery } from "@/features/source-control/api";
import {
  DIFF_LINE_FOCUS_CSS,
  getRenderedLineOffset,
  useDiffLineFocus,
} from "@/features/source-control/diffLineFocus";
import { createFocusedFileViewerTarget } from "@/features/source-control/fileViewerNavigation";
import {
  SOURCE_CONTROL_HOTKEY_OPTIONS,
  useVerticalNavigationHotkeys,
} from "@/features/source-control/hooks/keyboardNavigation";
import { getNextSymbolPeekIndex } from "@/features/source-control/hooks/symbolPeekNavigation";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import {
  closeSymbolPeek,
  openFileViewer,
  setSymbolPeekActiveIndex,
  setSymbolPeekQuery,
} from "@/features/source-control/sourceControlSlice";
import type { LspLocation, SymbolPeekKind, SymbolPeekState } from "@/features/source-control/types";

const SYMBOL_PEEK_HEIGHT_REM = 32;
const SYMBOL_PEEK_HEIGHT_PX = 250;
const SYMBOL_PEEK_OFFSET_PX = 4;

const PEEK_FILE_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
}

pre[data-file-type='single'] {
  overflow: hidden;
  min-width: 0;
}

${DIFF_LINE_FOCUS_CSS}
`;

type SymbolPeekDocument = {
  repoPath: string;
  relPath: string;
};

type SymbolPeekLocationItem = {
  index: number;
  location: LspLocation;
};

type SymbolPeekGroup = {
  relPath: string;
  items: SymbolPeekLocationItem[];
};

type SymbolPeekProps = {
  document?: SymbolPeekDocument;
  containerRef: RefObject<HTMLDivElement | null>;
};

function matchesSymbolPeekQuery(location: LspLocation, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return `${location.relPath} ${location.line} ${location.character + 1}`
    .toLowerCase()
    .includes(normalizedQuery);
}

function getSymbolPeekTitle(kind: SymbolPeekKind, count: number) {
  const noun = kind === "definitions" ? "Definitions" : "References";
  return `${noun} (${count})`;
}

function splitFileLines(contents: string | undefined) {
  return (contents ?? "").replace(/\r\n/g, "\n").split("\n");
}

function lineLabel(location: LspLocation) {
  return `Ln ${location.line}, Col ${location.character + 1}`;
}

function excerptForLocation(location: LspLocation, linesByPath: Map<string, string[]>) {
  const previewLines = linesByPath.get(location.relPath);
  const rawLine = previewLines?.[location.line - 1] ?? "";
  const compactLine = rawLine.trim();
  if (compactLine.length > 0) {
    return compactLine;
  }

  return `Line ${location.line}`;
}

function buildSymbolPeekGroups(
  locations: LspLocation[],
  query: string,
  linesByPath: Map<string, string[]>,
) {
  const groupsByPath = new Map<string, SymbolPeekGroup>();
  const filteredIndexes: number[] = [];

  for (const [index, location] of locations.entries()) {
    if (!matchesSymbolPeekQuery(location, query)) {
      continue;
    }

    filteredIndexes.push(index);

    const nextItem = {
      index,
      location,
    };

    const existingGroup = groupsByPath.get(location.relPath);
    if (existingGroup) {
      existingGroup.items.push(nextItem);
      continue;
    }

    groupsByPath.set(location.relPath, {
      relPath: location.relPath,
      items: [nextItem],
    });
  }

  return {
    groups: Array.from(groupsByPath.values()),
    filteredIndexes,
    excerptsByIndex: new Map(
      filteredIndexes.map((index) => [index, excerptForLocation(locations[index], linesByPath)]),
    ),
  };
}

function SymbolPeekPreview({
  location,
  contents,
}: {
  location: LspLocation | null;
  contents: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const previewRef = useRef<HTMLDivElement | null>(null);
  const focusKey = location ? `${location.relPath}:${location.line}:${location.character}` : null;

  useDiffLineFocus({
    containerRef: previewRef,
    lineNumber: location?.line ?? null,
    focusKey,
    enabled: Boolean(location && contents !== null),
  });

  if (!location || contents === null) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center px-3 text-xs">
        No preview available.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="border-border/70 border-b px-2 py-1">
        <div className="truncate text-[11px] font-medium">{location.relPath}</div>
      </div>
      <div ref={previewRef} className="min-h-0 flex-1 overflow-auto">
        <PierreFile
          file={{
            name: location.relPath,
            contents,
          }}
          className="block min-w-0 max-w-full"
          selectedLines={{ start: location.line, end: location.line }}
          options={{
            theme: getDiffTheme(),
            themeType: getDiffThemeType(resolvedTheme),
            unsafeCSS: PEEK_FILE_CSS,
            disableLineNumbers: false,
            disableFileHeader: true,
          }}
        />
      </div>
    </div>
  );
}

export function LspSymbolPeekContainer({ document, containerRef }: SymbolPeekProps) {
  const symbolPeek = useAppSelector((state) => state.sourceControl.symbolPeek);

  const isVisible =
    document !== undefined &&
    symbolPeek !== null &&
    symbolPeek.sourceDocument.repoPath === document.repoPath &&
    symbolPeek.sourceDocument.relPath === document.relPath;

  if (!isVisible) {
    return null;
  }

  return <LspSymbolPeek document={document} containerRef={containerRef} symbolPeek={symbolPeek} />;
}

type LspSymbolPeekProps = {
  document: SymbolPeekDocument;
  containerRef: RefObject<HTMLDivElement | null>;
  symbolPeek: SymbolPeekState;
};

export function LspSymbolPeek({ document, containerRef, symbolPeek }: LspSymbolPeekProps) {
  const dispatch = useAppDispatch();
  const deferredQuery = useDeferredValue(symbolPeek.query);
  const [popoverTop, setPopoverTop] = useState<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);

  const locations = symbolPeek.locations;
  const activeIndex = symbolPeek.activeIndex;
  const activeLocation = symbolPeek.locations[activeIndex];
  const anchorLineNumber = symbolPeek.anchor.lineNumber;
  const anchorLineIndex = symbolPeek.anchor.lineIndex;

  const previewQuery = useGetRepoFileQuery(
    activeLocation
      ? {
          repoPath: activeLocation.repoPath,
          relPath: activeLocation.relPath,
        }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );

  const previewFile = previewQuery.data;
  const previewError = errorMessageFrom(previewQuery.error, "");
  const locationPaths = useMemo(
    () => Array.from(new Set(locations.map((location) => location.relPath))),
    [locations],
  );

  const cachedFileContentsByPath = useAppSelector((state) => {
    const next: Record<string, string> = {};
    for (const relPath of locationPaths) {
      const cached = gitApi.endpoints.getRepoFile.select({
        repoPath: document.repoPath,
        relPath,
      })(state).data;
      if (cached?.contents) {
        next[relPath] = cached.contents;
      }
    }
    return next;
  }, shallowEqual);

  useEffect(() => {
    for (const relPath of locationPaths) {
      // Prime cache for peek list excerpts so cross-file results are stable.
      void dispatch(
        gitApi.util.prefetch("getRepoFile", { repoPath: document.repoPath, relPath }, {}),
      );
    }
  }, [dispatch, document.repoPath, locationPaths]);

  const linesByPath = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const [relPath, contents] of Object.entries(cachedFileContentsByPath)) {
      map.set(relPath, splitFileLines(contents));
    }
    if (activeLocation && previewFile?.contents && !map.has(activeLocation.relPath)) {
      map.set(activeLocation.relPath, splitFileLines(previewFile.contents));
    }
    return map;
  }, [activeLocation, cachedFileContentsByPath, previewFile?.contents]);

  const { groups, filteredIndexes, excerptsByIndex } = useMemo(
    () => buildSymbolPeekGroups(locations, deferredQuery, linesByPath),
    [deferredQuery, linesByPath, locations],
  );

  function closePeek() {
    dispatch(closeSymbolPeek());
  }

  function setActiveIndex(index: number) {
    dispatch(setSymbolPeekActiveIndex(index));
  }

  function commitSelection(index: number) {
    const location = locations[index];
    if (!location) {
      return;
    }
    const returnToDiff = symbolPeek?.returnToDiff ?? null;

    dispatch(
      openFileViewer(
        createFocusedFileViewerTarget(location, {
          returnToDiff,
        }),
      ),
    );
  }

  useEffect(() => {
    if (filteredIndexes.length > 0 && !filteredIndexes.includes(symbolPeek.activeIndex)) {
      dispatch(setSymbolPeekActiveIndex(filteredIndexes[0]));
    }
  }, [dispatch, filteredIndexes, symbolPeek]);

  useEffect(() => {
    if (anchorLineNumber === null) {
      setPopoverTop(null);
      return;
    }
    const targetAnchorLineNumber = anchorLineNumber;
    const targetAnchorLineIndex = anchorLineIndex;

    let cancelled = false;
    let attempt = 0;
    let frameId = 0;

    const updateTop = () => {
      if (cancelled) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const offset = getRenderedLineOffset(
        container,
        targetAnchorLineNumber,
        targetAnchorLineIndex,
      );

      if (!offset) {
        if (attempt < 24) {
          attempt += 1;
          frameId = requestAnimationFrame(updateTop);
        }
        return;
      }

      const maxTop = container.scrollTop + container.clientHeight - SYMBOL_PEEK_HEIGHT_PX - 4;
      const nextTop = Math.max(
        container.scrollTop,
        Math.min(offset.bottom + SYMBOL_PEEK_OFFSET_PX, maxTop),
      );

      setPopoverTop(nextTop);
    };

    frameId = requestAnimationFrame(updateTop);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
    };
  }, [anchorLineIndex, anchorLineNumber, containerRef]);

  const scrollToItem = (index: number) => {
    if (!listContainerRef.current) {
      return;
    }

    const activeItem = listContainerRef.current.querySelector<HTMLElement>(
      `[data-symbol-peek-index="${index}"]`,
    );
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  };

  useVerticalNavigationHotkeys({
    onNext: (event) => {
      const state = { sourceControl: { symbolPeek } } as RootState;
      const nextIndex = getNextSymbolPeekIndex(state, true);
      if (nextIndex !== null) {
        event.preventDefault();
        scrollToItem(nextIndex);
        setActiveIndex(nextIndex);
      }
    },
    onPrevious: (event) => {
      const state = { sourceControl: { symbolPeek } } as RootState;
      const nextIndex = getNextSymbolPeekIndex(state, false);
      if (nextIndex !== null) {
        event.preventDefault();
        scrollToItem(nextIndex);
        setActiveIndex(nextIndex);
      }
    },
  });

  useHotkey(
    "Enter",
    (event) => {
      if (activeLocation === null) {
        return;
      }

      event.preventDefault();
      commitSelection(activeIndex);
    },
    {
      ...SOURCE_CONTROL_HOTKEY_OPTIONS,
      enabled: activeLocation !== null,
    },
  );

  useHotkey(
    "Escape",
    (event) => {
      event.preventDefault();
      closePeek();
    },
    {
      ...SOURCE_CONTROL_HOTKEY_OPTIONS,
    },
  );

  if (symbolPeek === null || popoverTop === null) {
    return null;
  }

  return (
    <div
      className="bg-popover text-popover-foreground border-border absolute right-0 left-0 z-20 border shadow-md"
      style={{
        top: `${popoverTop}px`,
        height: `${SYMBOL_PEEK_HEIGHT_REM}rem`,
      }}
    >
      <div className="border-border flex h-7 items-center gap-2 border-b px-2 text-[11px]">
        <div className="text-primary truncate">{activeLocation?.relPath ?? document.relPath}</div>
        <div className="text-muted-foreground truncate">
          - {getSymbolPeekTitle(symbolPeek.kind, locations.length)}
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-popover-foreground hover:bg-accent ml-auto inline-flex h-5 w-5 items-center justify-center"
          onClick={closePeek}
          aria-label="Close symbol peek"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid h-[calc(100%-1.75rem)] min-h-0 grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-h-0 min-w-0 border-r border-border">
          {previewError ? (
            <div className="text-destructive px-3 py-2 text-xs">{previewError}</div>
          ) : previewQuery.isFetching && previewFile === undefined ? (
            <div className="text-muted-foreground px-3 py-2 text-xs">Loading preview...</div>
          ) : (
            <SymbolPeekPreview location={activeLocation} contents={previewFile?.contents ?? null} />
          )}
        </section>

        <section className="bg-muted flex min-h-0 min-w-0 flex-col">
          <div className="border-border flex h-7 items-center gap-2 border-b px-2">
            <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
            <input
              value={symbolPeek.query}
              onChange={(event) => {
                dispatch(setSymbolPeekQuery(event.target.value));
              }}
              className="text-popover-foreground placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-[11px] outline-none"
              placeholder="Filter"
            />
          </div>

          <div ref={listContainerRef} className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <div className="text-muted-foreground px-2 py-2 text-[11px]">
                No matching symbols.
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.relPath} className="border-border border-b last:border-b-0">
                  <div className="text-popover-foreground flex h-6 items-center gap-2 px-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate">{group.relPath}</span>
                    <span className="text-primary">{group.items.length}</span>
                  </div>
                  {group.items.map(({ index, location }) => {
                    const isActive = index === activeIndex;
                    return (
                      <button
                        key={`${location.relPath}:${location.line}:${location.character}:${index}`}
                        type="button"
                        data-symbol-peek-index={index}
                        className={`block w-full border-t border-border px-2 py-1.5 text-left text-[11px] ${
                          isActive ? "bg-surface-active" : "hover:bg-accent/50"
                        }`}
                        onClick={() => {
                          setActiveIndex(index);
                        }}
                        onDoubleClick={() => {
                          commitSelection(index);
                        }}
                      >
                        <div className="text-popover-foreground">{lineLabel(location)}</div>
                        <div className="text-primary truncate pt-0.5">
                          {excerptsByIndex.get(index) ?? `Line ${location.line}`}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
