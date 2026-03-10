import { useEffect, useState } from 'react'
import { FileDiff as PierreFileDiff, Virtualizer, useWorkerPool } from '@pierre/diffs/react'
import { FileWarning } from 'lucide-react'
import { useTheme } from 'next-themes'

import { useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  fileComments,
  toLineAnnotations,
} from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import { useFirstCommentTip } from '@/features/comments/useFirstCommentTip'
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
import { MAX_DIFF_LINE_LENGTH } from '@/features/diff-view/services/diffRenderLimits'
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

pre[data-diff-type='single'] {
  overflow: hidden;
  min-width: 0;
}
`

function getDiffIdentity(
  activePath: string,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
): string {
  return [
    activePath,
    oldFile?.name ?? '',
    oldFile?.contents.length ?? 0,
    newFile?.name ?? '',
    newFile?.contents.length ?? 0,
  ].join(':')
}

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
  const activeDiffIdentity = getDiffIdentity(activePath, oldFile, newFile)

  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
  const [expandUnchanged, setExpandUnchanged] = useState(false)
  const [forceShowLargeDiffIdentity, setForceShowLargeDiffIdentity] = useState<string | null>(null)
  const forceShowLargeDiff = forceShowLargeDiffIdentity === activeDiffIdentity

  const diffTheme = getDiffTheme()
  const { annotations: currentAnnotations } =
    useCurrentFileComments(activeRepo, activePath, commentContext, canComment)
  const repoCommentCount = useAppSelector((state) => {
    if (!canComment || !activeRepo) return 0
    return state.comments.filter((c) => c.repoPath === activeRepo).length
  })
  const {
    showTip: showCopyTip,
    dismissTip: dismissCopyTip,
    showFirstCommentTip,
  } = useFirstCommentTip()
  const diffThemeCacheSalt = getDiffThemeCacheSalt(diffThemeType)
  const { currentFileDiff, diffRenderGate, isParsingDiff } = useParsedDiff({
    activePath,
    oldFile,
    newFile,
    cacheSalt: diffThemeCacheSalt,
    allowLargeDiff: forceShowLargeDiff,
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
          onBeforeSubmit={repoCommentCount === 0 ? showFirstCommentTip : undefined}
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
    maxLineDiffLength: MAX_DIFF_LINE_LENGTH,
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

  const renderLargeDiffWarning = () => {
    return (
      <Empty className="border-0 rounded-none h-full gap-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyTitle>Diff too large</EmptyTitle>
          <EmptyDescription>
            The diff is too large to be displayed by default. You can show it anyway, but
            performance may be negatively impacted.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={() => setForceShowLargeDiffIdentity(activeDiffIdentity)}>
            Show diff
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  const renderUnrenderableDiffWarning = () => {
    return (
      <Empty className="border-0 rounded-none h-full gap-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileWarning />
          </EmptyMedia>
          <EmptyTitle>Diff too large</EmptyTitle>
          <EmptyDescription>The diff is too large to be displayed.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <Virtualizer
        key={diffViewportKey}
        className="h-full min-w-0 overflow-y-auto overflow-x-hidden"
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
                showCopyTip={showCopyTip}
                onDismissCopyTip={dismissCopyTip}
                onToggleExpandUnchanged={() => {
                  setExpandUnchanged((current) => !current)
                }}
              />
            )}
            options={diffOptions}
          />
        ) : diffRenderGate === 'unrenderable' ? (
          renderUnrenderableDiffWarning()
        ) : diffRenderGate === 'large' && !forceShowLargeDiff ? (
          renderLargeDiffWarning()
        ) : isParsingDiff ? (
          <div className="text-muted-foreground p-3 text-xs">Parsing diff...</div>
        ) : (
          <div className="text-muted-foreground p-3 text-xs">No diff content.</div>
        )}
      </Virtualizer>
    </div>
  )
}
