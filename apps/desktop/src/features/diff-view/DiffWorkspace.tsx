import { useEffect, useRef, useState } from 'react'
import { FileDiff as PierreFileDiff, Virtualizer, useWorkerPool } from '@pierre/diffs/react'
import { useTheme } from 'next-themes'

import { useAppSelector } from '@/app/hooks'
import {
  fileComments,
  toLineAnnotations,
} from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import type {
  CommentContext,
  CommentItem,
  DiffAnnotationItem,
  DiffFile,
  SelectionRange,
} from '@/features/source-control/types'
import { CommentAnnotation } from '@/features/diff-view/components/CommentAnnotation'
import { CommentComposer } from '@/features/diff-view/components/CommentComposer'
import { DiffHeaderMetadataControls } from '@/features/diff-view/components/DiffHeaderMetadataControls'
import {
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_THEME,
  getDiffTheme,
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from '@/features/diff-view/diffRenderConfig'
import { useParsedDiff } from '@/features/diff-view/hooks/useParsedDiff'
import {
  formatRange,
} from '@/features/source-control/utils'
import type { DiffLineAnnotation, FileDiffOptions } from '@pierre/diffs'

type Props = {
  oldFile: DiffFile | null
  newFile: DiffFile | null
  activePath: string
  commentContext: CommentContext
  canComment: boolean
}

const STICKY_HEADER_CSS = `
:host {
  min-width: 0;
  max-width: 100%;
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

[data-diffs-header] [data-header-content] {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
}

[data-diffs-header] [data-prev-name],
[data-diffs-header] [data-title] {
  flex: 1 1 0;
  min-width: 0;
  direction: ltr;
  text-align: left;
}

[data-diffs-header] [data-metadata] {
  flex: 0 0 auto;
  min-width: 0;
}

[data-diff-type='split'][data-overflow='scroll'] {
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
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

type FileCommentsResult = {
  comments: CommentItem[]
  annotations: ReturnType<typeof toLineAnnotations>
}

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
    }
  )
}

export function DiffWorkspace({ oldFile, newFile, activePath, commentContext, canComment }: Props) {
  const { resolvedTheme } = useTheme()
  const workerPool = useWorkerPool()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle)
  const diffThemeType = getDiffThemeType(resolvedTheme)

  const diffViewportContainerRef = useRef<HTMLDivElement | null>(null)

  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
  const [expandUnchanged, setExpandUnchanged] = useState(false)

  const diffTheme = getDiffTheme()
  const { annotations: currentAnnotations } =
    useCurrentFileComments(activeRepo, activePath, commentContext, canComment)
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType)
  const { currentFileDiff, isParsingDiff } = useParsedDiff({
    activePath,
    oldFile,
    newFile,
    cacheSalt: diffThemeCacheSalt,
  })

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

  const applySelectionRange = (range: SelectionRange | null) => {
    setSelectedRange(range)
  }

  const onLineSelectionEnd = (range: SelectionRange | null) => {
    setSelectedRange(range)
  }

  const renderCommentAnnotation = (annotation: { metadata?: DiffAnnotationItem }) => {
    const data = annotation.metadata
    if (!data) return null

    if (data.type === 'composer') {
      return (
        <CommentComposer
          visible
          label={selectedRangeLabel}
          activePath={activePath}
          selectedRange={selectedRange}
          commentContext={commentContext}
          onClose={onCloseCommentComposer}
        />
      )
    }

    return <CommentAnnotation comment={data} />
  }

  const diffOptions: FileDiffOptions<DiffAnnotationItem> = {
    diffStyle,
    theme: diffTheme,
    themeType: diffThemeType,
    unsafeCSS: STICKY_HEADER_CSS,
    disableLineNumbers: false,
    expandUnchanged,
    expansionLineCount: 20,
    hunkSeparators: 'line-info-basic' as const,
    enableLineSelection: canComment,
    onLineSelected: canComment ? applySelectionRange : undefined,
    onLineSelectionEnd: canComment ? onLineSelectionEnd : undefined,
  }

  const onCloseCommentComposer = () => {
    setSelectedRange(null)
  }

  const selectedRangeLabel = selectedRange
    ? formatRange(selectedRange.start, selectedRange.end)
    : ''
  const annotationsWithComposer: DiffLineAnnotation<DiffAnnotationItem>[] = selectedRange ? [
                ...currentAnnotations,
                {
                    lineNumber: selectedRange.end,
                    metadata: {
                      type: 'composer',
                      side: selectedRange.side ?? 'deletions',
                      endSide: selectedRange.endSide,
                      startLine: selectedRange.start,
                      endLine: selectedRange.end,
                    },
                    side: selectedRange.side ?? 'deletions'
                  }
                ] : currentAnnotations
  const diffViewportKey = `${oldFile?.name}-${newFile?.name}-${expandUnchanged ? 'expanded' : 'collapsed'}`

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div
        key={diffViewportKey}
        ref={diffViewportContainerRef}
        className="relative min-h-0 min-w-0 flex-1"
      >
        <Virtualizer
          className="h-full min-w-0 overflow-auto"
          contentClassName="relative min-h-full min-w-0"
        >
          {currentFileDiff ? (
            <PierreFileDiff
              className="block min-w-0 max-w-full"
              fileDiff={currentFileDiff}
              selectedLines={selectedRange}
              lineAnnotations={annotationsWithComposer}
              renderAnnotation={renderCommentAnnotation}
              renderHeaderMetadata={() => (
                <DiffHeaderMetadataControls
                  activePath={activePath}
                  canComment={canComment}
                  commentContext={commentContext}
                  expandUnchanged={expandUnchanged}
                  onToggleExpandUnchanged={() => {
                    setExpandUnchanged((current) => !current)
                  }}
                />
              )}
              options={diffOptions}
            />
          ) : isParsingDiff ? (
            <div className="text-muted-foreground p-3 text-xs">Parsing diff...</div>
          ) : (
            <div className="text-muted-foreground p-3 text-xs">No diff content.</div>
          )}
        </Virtualizer>
      </div>
    </div>
  )
}
