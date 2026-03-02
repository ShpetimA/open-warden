import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FileDiff as PierreFileDiff, Virtualizer, useWorkerPool } from '@pierre/diffs/react'
import { useTheme } from 'next-themes'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  fileComments,
  removeComment,
  toLineAnnotations,
} from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import type {
  CommentContext,
  CommentItem,
  DiffFile,
  SelectionRange,
} from '@/features/source-control/types'
import { CommentAnnotation } from '@/features/diff-view/components/CommentAnnotation'
import { CommentComposer } from '@/features/diff-view/components/CommentComposer'
import { DiffHeaderMetadataControls } from '@/features/diff-view/components/DiffHeaderMetadataControls'
import { useParsedDiff } from '@/features/diff-view/hooks/useParsedDiff'
import {
  areRangesEqual,
  formatRange,
  normalizeRange,
  parseSelectionRange,
} from '@/features/source-control/utils'
import type { FileDiffOptions } from '@pierre/diffs'

type Props = {
  oldFile: DiffFile | null
  newFile: DiffFile | null
  activePath: string
  commentContext: CommentContext
  canComment: boolean
}

type ComposerPosition = { top: number; left: number; visible: boolean }
const DEFAULT_DARK_THEME = 'github-dark'
const DEFAULT_LIGHT_THEME = 'github-light'
const STICKY_HEADER_CSS = `
[data-diffs-header] {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--diffs-bg);
  border-bottom: 1px solid color-mix(in lab, var(--diffs-bg) 90%, var(--diffs-fg));
}
`

function areThemeValuesEqual(
  currentTheme: string | { dark: string; light: string } | undefined,
  nextTheme: { dark: string; light: string },
): boolean {
  if (!currentTheme) return false
  if (typeof currentTheme === 'string') return false
  return currentTheme.dark === nextTheme.dark && currentTheme.light === nextTheme.light
}

function updateComposerPositionForRange(
  viewport: HTMLDivElement | null,
  selectedRange: SelectionRange | null,
  setComposerPos: React.Dispatch<React.SetStateAction<ComposerPosition>>,
) {
  if (!viewport || !selectedRange) {
    setComposerPos((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    return
  }

  const diffContainer = viewport.querySelector('diffs-container')
  const shadowRoot = diffContainer instanceof HTMLElement ? diffContainer.shadowRoot : null
  const selectedRows = shadowRoot
    ? Array.from(shadowRoot.querySelectorAll<HTMLElement>('[data-selected-line]'))
    : Array.from(viewport.querySelectorAll<HTMLElement>('[data-selected-line]'))

  if (selectedRows.length === 0) {
    const nextTop = viewport.scrollTop + 32
    const nextLeft = 12
    setComposerPos((prev) => {
      if (prev.visible && prev.top === nextTop && prev.left === nextLeft) return prev
      return { top: nextTop, left: nextLeft, visible: true }
    })
    return
  }

  const viewportRect = viewport.getBoundingClientRect()
  let anchorRect = selectedRows[0].getBoundingClientRect()
  for (let i = 1; i < selectedRows.length; i += 1) {
    const rowRect = selectedRows[i].getBoundingClientRect()
    if (rowRect.bottom > anchorRect.bottom) anchorRect = rowRect
  }

  const top = anchorRect.bottom - viewportRect.top + viewport.scrollTop + 4
  const left = Math.max(
    8,
    Math.min(anchorRect.left - viewportRect.left + viewport.scrollLeft, viewport.clientWidth - 320),
  )

  setComposerPos((prev) => {
    if (prev.visible && prev.top === top && prev.left === left) return prev
    return { top, left, visible: true }
  })
}

/**
 * Shallow-compares two comment lists by id and text to avoid creating new
 * references when Redux produces a new array with identical content.
 */
function areCommentListsEqual(a: CommentItem[], b: CommentItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].text !== b[i].text) return false
  }
  return true
}

type FileCommentsResult = {
  comments: CommentItem[]
  annotations: ReturnType<typeof toLineAnnotations>
}

/**
 * Selects comments and their derived line annotations for the current file.
 * Uses custom equality so both arrays are referentially stable when the
 * underlying data hasn't actually changed.  A stable `annotations` reference
 * prevents @pierre/diffs from re-rendering annotation DOM nodes on every
 * unrelated Redux update, which is the primary cause of the scroll-jump bug.
 */
function useCurrentFileComments(
  activeRepo: string,
  activePath: string,
  commentContext: CommentContext,
  canComment: boolean,
): FileCommentsResult {
  return useAppSelector(
    (state): FileCommentsResult => {
      if (!canComment) return { comments: [], annotations: [] }
      const allComments = compactComments(state.comments)
      const filtered = fileComments(allComments, activeRepo, activePath, commentContext)
      return { comments: filtered, annotations: toLineAnnotations(filtered) }
    },
    (a, b) => areCommentListsEqual(a.comments, b.comments),
  )
}

export function DiffWorkspace({ oldFile, newFile, activePath, commentContext, canComment }: Props) {
  const dispatch = useAppDispatch()
  const { resolvedTheme } = useTheme()
  const workerPool = useWorkerPool()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle)
  const diffThemeType = resolvedTheme === 'dark' ? 'dark' : 'light'

  const diffViewportContainerRef = useRef<HTMLDivElement | null>(null)
  const diffViewportRef = useRef<HTMLDivElement | null>(null)
  const composerScrollRafRef = useRef<number | null>(null)
  const savedScrollTopRef = useRef<number | null>(null)

  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
  const [composerPos, setComposerPos] = useState<ComposerPosition>({
    top: 0,
    left: 0,
    visible: false,
  })

  const diffTheme = { dark: DEFAULT_DARK_THEME, light: DEFAULT_LIGHT_THEME }
  const { comments: currentFileComments, annotations: currentAnnotations } =
    useCurrentFileComments(activeRepo, activePath, commentContext, canComment)
  const diffThemeCacheSalt = `${DEFAULT_DARK_THEME}:${DEFAULT_LIGHT_THEME}:${diffThemeType}`
  const { currentFileDiff, isParsingDiff } = useParsedDiff({
    activePath,
    oldFile,
    newFile,
    cacheSalt: diffThemeCacheSalt,
  })

  const onDiffViewportScroll = useCallback(() => {
    if (!selectedRange) return
    if (composerScrollRafRef.current != null) return
    composerScrollRafRef.current = window.requestAnimationFrame(() => {
      composerScrollRafRef.current = null
      updateComposerPositionForRange(diffViewportRef.current, selectedRange, setComposerPos)
    })
  }, [selectedRange])

  useEffect(() => {
    const container = diffViewportContainerRef.current
    const viewport = container?.firstElementChild
    if (!(viewport instanceof HTMLDivElement)) return

    diffViewportRef.current = viewport
    viewport.addEventListener('scroll', onDiffViewportScroll, {
      passive: true,
    })

    return () => {
      viewport.removeEventListener('scroll', onDiffViewportScroll)
      if (diffViewportRef.current === viewport) diffViewportRef.current = null
    }
  }, [onDiffViewportScroll])

  useEffect(() => {
    return () => {
      if (composerScrollRafRef.current != null) {
        window.cancelAnimationFrame(composerScrollRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedRange) return

    const id = window.requestAnimationFrame(() => {
      updateComposerPositionForRange(diffViewportRef.current, selectedRange, setComposerPos)
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedRange])

  // Restore scroll position synchronously after DOM commits that follow
  // comment mutations or selection changes. The @pierre/diffs library's
  // useLayoutEffect (no deps) calls instance.render() on every React render,
  // which can mutate DOM (buffer heights, annotation nodes) outside the
  // Virtualizer's scroll-fix pipeline, causing the viewport to jump.
  // This effect runs after that library layout effect and corrects the
  // scroll position before the browser paints.
  useLayoutEffect(() => {
    if (savedScrollTopRef.current == null) return
    const viewport = diffViewportRef.current
    if (viewport) {
      viewport.scrollTop = savedScrollTopRef.current
    }
    savedScrollTopRef.current = null
  }, [currentFileComments, selectedRange])

  useEffect(() => {
    if (!workerPool) return

    const nextTheme = { dark: DEFAULT_DARK_THEME, light: DEFAULT_LIGHT_THEME }
    const currentOptions = workerPool.getDiffRenderOptions()
    if (areThemeValuesEqual(currentOptions.theme, nextTheme)) return

    void workerPool.setRenderOptions({
      ...currentOptions,
      theme: nextTheme,
    })
  }, [workerPool])

  /** Save the viewport scroll position before dispatching a comment mutation. */
  const saveScrollPosition = () => {
    const viewport = diffViewportRef.current
    if (viewport) {
      savedScrollTopRef.current = viewport.scrollTop
    }
  }

  const dispatchRemoveComment = (id: string) => {
    saveScrollPosition()
    dispatch(removeComment(id))
  }

  const applySelectionRange = (range: unknown) => {
    const parsedRange = parseSelectionRange(range)
    if (areRangesEqual(selectedRange, parsedRange)) return
    setSelectedRange(parsedRange)
  }

  const onLineSelectionEnd = (range: unknown) => {
    const parsedRange = parseSelectionRange(range)
    if (areRangesEqual(selectedRange, parsedRange)) return
    saveScrollPosition()
    setSelectedRange(parsedRange)
    window.requestAnimationFrame(() => {
      updateComposerPositionForRange(diffViewportRef.current, parsedRange, setComposerPos)
    })
  }

  const renderCommentAnnotation = (annotation: { metadata?: CommentItem }) => {
    const data = annotation.metadata
    if (!data) return null

    return <CommentAnnotation comment={data} onBeforeMutate={saveScrollPosition} />
  }

  const diffOptions: FileDiffOptions<CommentItem> = {
    diffStyle,
    theme: diffTheme,
    themeType: diffThemeType,
    unsafeCSS: STICKY_HEADER_CSS,
    disableLineNumbers: false,
    expandUnchanged: false,
    expansionLineCount: 20,
    hunkSeparators: 'line-info' as const,
    enableLineSelection: canComment,
    onLineSelected: canComment ? applySelectionRange : undefined,
    onLineSelectionEnd: canComment ? onLineSelectionEnd : undefined,
  }

  const onCloseCommentComposer = () => {
    setSelectedRange(null)
    setComposerPos((prev) => ({ ...prev, visible: false }))
  }

  const normalizedRange = selectedRange ? normalizeRange(selectedRange) : null
  const selectedRangeLabel = normalizedRange
    ? formatRange(normalizedRange.start, normalizedRange.end)
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      {canComment && currentFileComments.length > 0 ? (
        <div className="border-border border-b px-2 py-1">
          <div className="space-y-1">
            {currentFileComments.map((comment) => (
              <div
                key={comment.id}
                className="bg-surface-alt flex items-center gap-2 px-2 py-1 text-[11px]"
              >
                <span className="text-muted-foreground">
                  {formatRange(comment.startLine, comment.endLine)}
                </span>
                <span className="truncate">{comment.text}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground ml-auto"
                  onClick={() => dispatchRemoveComment(comment.id)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        key={`${oldFile?.name}-${newFile?.name}`}
        ref={diffViewportContainerRef}
        className="relative min-h-0 flex-1"
      >
        <Virtualizer className="h-full overflow-auto" contentClassName="relative min-h-full">
          {currentFileDiff ? (
            <PierreFileDiff
              fileDiff={currentFileDiff}
              selectedLines={selectedRange}
              lineAnnotations={currentAnnotations}
              renderAnnotation={renderCommentAnnotation}
              renderHeaderMetadata={() => (
                <DiffHeaderMetadataControls
                  activePath={activePath}
                  canComment={canComment}
                  commentContext={commentContext}
                />
              )}
              options={diffOptions}
            />
          ) : isParsingDiff ? (
            <div className="text-muted-foreground p-3 text-xs">Parsing diff...</div>
          ) : (
            <div className="text-muted-foreground p-3 text-xs">No diff content.</div>
          )}

          <CommentComposer
            visible={canComment && !!selectedRange && composerPos.visible}
            top={composerPos.top}
            left={composerPos.left}
            label={selectedRangeLabel}
            activePath={activePath}
            selectedRange={selectedRange}
            commentContext={commentContext}
            onClose={onCloseCommentComposer}
            onBeforeSubmit={saveScrollPosition}
          />
        </Virtualizer>
      </div>
    </div>
  )
}
