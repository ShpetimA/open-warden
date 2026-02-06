import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from '@legendapp/state/react'
import { FileDiff } from '@pierre/diffs/react'
import { Check, GitPullRequestArrow, PanelLeft } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addComment, copyComments, fileComments, removeComment, toLineAnnotations } from '@/features/comments/actions'
import { safeComments } from '@/features/comments/selectors'
import { setDiffStyle } from '@/features/source-control/actions'
import { appState$ } from '@/features/source-control/store'
import type { CommentItem, SelectionRange } from '@/features/source-control/types'
import {
  areRangesEqual,
  buildDiffCacheKey,
  formatRange,
  normalizeRange,
  parseSelectionRange,
  parseSingleFileDiff,
} from '@/features/source-control/utils'

type Props = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
}

export function DiffWorkspace({ sidebarOpen, onToggleSidebar }: Props) {
  const activeRepo = useSelector(appState$.activeRepo)
  const activeBucket = useSelector(appState$.activeBucket)
  const activePath = useSelector(appState$.activePath)
  const patch = useSelector(appState$.patch)
  const diffStyle = useSelector(appState$.diffStyle)
  const comments = useSelector(appState$.comments)

  const diffViewportRef = useRef<HTMLDivElement | null>(null)
  const composerInputRef = useRef<HTMLInputElement | null>(null)
  const composerScrollRafRef = useRef<number | null>(null)

  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(null)
  const [draftComment, setDraftComment] = useState('')
  const [composerPos, setComposerPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  })

  const allComments = useMemo(() => safeComments(comments), [comments])
  const currentFileComments = useMemo(() => fileComments(allComments, activeRepo, activePath), [allComments, activeRepo, activePath])
  const currentAnnotations = useMemo(() => toLineAnnotations(currentFileComments), [currentFileComments])

  const currentFileDiff = useMemo(() => {
    if (!patch.trim() || !activeRepo || !activePath) return null
    const cacheKey = buildDiffCacheKey(activeRepo, activeBucket, activePath, patch)
    return parseSingleFileDiff(patch, cacheKey)
  }, [patch, activeRepo, activeBucket, activePath])

  const updateComposerPosition = useCallback(() => {
    const viewport = diffViewportRef.current
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
    const left = Math.max(8, Math.min(anchorRect.left - viewportRect.left + viewport.scrollLeft, viewport.clientWidth - 320))

    setComposerPos((prev) => {
      if (prev.visible && prev.top === top && prev.left === left) return prev
      return { top, left, visible: true }
    })
  }, [selectedRange])

  const onDiffViewportScroll = useCallback(() => {
    if (!selectedRange) return
    if (composerScrollRafRef.current != null) return
    composerScrollRafRef.current = window.requestAnimationFrame(() => {
      composerScrollRafRef.current = null
      updateComposerPosition()
    })
  }, [selectedRange, updateComposerPosition])

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
      updateComposerPosition()
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedRange, updateComposerPosition])

  useEffect(() => {
    if (!composerPos.visible) return
    const id = window.requestAnimationFrame(() => {
      composerInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [composerPos.visible])

  const applySelectionRange = useCallback((range: unknown) => {
    const parsedRange = parseSelectionRange(range)
    if (areRangesEqual(selectedRange, parsedRange)) return
    setSelectedRange(parsedRange)
  }, [selectedRange])

  const onLineSelectionEnd = useCallback((range: unknown) => {
    applySelectionRange(range)
    window.requestAnimationFrame(() => {
      updateComposerPosition()
    })
  }, [applySelectionRange, updateComposerPosition])

  const renderCommentAnnotation = useCallback((annotation: { metadata?: CommentItem }) => {
    const data = annotation.metadata
    if (!data) return null
    return <div className="bg-accent text-accent-foreground max-w-[28rem] rounded px-1.5 py-0.5 text-[10px]">{data.text}</div>
  }, [])

  const diffOptions = useMemo(() => {
    return {
      diffStyle,
      themeType: 'dark' as const,
      disableLineNumbers: false,
      enableLineSelection: true,
      onLineSelected: applySelectionRange,
      onLineSelectionEnd,
    }
  }, [diffStyle, applySelectionRange, onLineSelectionEnd])

  const onAddComment = () => {
    if (!selectedRange || !draftComment.trim() || !activePath) return
    addComment(selectedRange, draftComment)
    setDraftComment('')
    setSelectedRange(null)
  }

  const onCancelComment = () => {
    setSelectedRange(null)
    setDraftComment('')
    setComposerPos((prev) => ({ ...prev, visible: false }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-[#2f3138] px-2 py-1">
        <Button
          size="sm"
          variant="ghost"
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
        >
          <PanelLeft className="mr-1 h-3.5 w-3.5" />
          {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
        </Button>

        <Button size="sm" variant={diffStyle === 'split' ? 'secondary' : 'ghost'} onClick={() => setDiffStyle('split')}>
          <GitPullRequestArrow className="mr-1 h-3.5 w-3.5" /> Split
        </Button>
        <Button
          size="sm"
          variant={diffStyle === 'unified' ? 'secondary' : 'ghost'}
          onClick={() => setDiffStyle('unified')}
        >
          <Check className="mr-1 h-3.5 w-3.5" /> Unified
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void copyComments('file')
          }}
          disabled={!activePath || currentFileComments.length === 0}
        >
          Copy Comments (File)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void copyComments('all')
          }}
          disabled={allComments.length === 0}
        >
          Copy Comments (All)
        </Button>
        <div className="ml-auto text-xs text-[#8f96a8]">
          {activePath} <Badge variant="secondary">{activeBucket}</Badge>
        </div>
      </div>

      {currentFileComments.length > 0 ? (
        <div className="border-b border-[#2f3138] px-2 py-1">
          <div className="space-y-1">
            {currentFileComments.map((comment) => (
              <div key={comment.id} className="flex items-center gap-2 rounded bg-[#23262f] px-2 py-1 text-[11px]">
                <span className="text-[#8f96a8]">{formatRange(comment.startLine, comment.endLine)}</span>
                <span className="truncate">{comment.text}</span>
                <button
                  type="button"
                  className="ml-auto text-[#9ea7bb] hover:text-white"
                  onClick={() => removeComment(comment.id)}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div ref={diffViewportRef} className="relative min-h-0 flex-1 overflow-auto" onScroll={onDiffViewportScroll}>
        {currentFileDiff ? (
          <FileDiff
            fileDiff={currentFileDiff}
            selectedLines={selectedRange}
            lineAnnotations={currentAnnotations}
            renderAnnotation={renderCommentAnnotation}
            options={diffOptions}
          />
        ) : (
          <div className="p-3 text-xs text-[#8f96a8]">Could not parse patch for caching.</div>
        )}

        {selectedRange && composerPos.visible ? (
          <div
            className="absolute z-20 w-80 rounded border border-[#3a3d48] bg-[#1a1d25] p-2 shadow-xl"
            style={{ top: composerPos.top, left: composerPos.left }}
          >
            <div className="mb-1 text-[11px] text-[#c5cada]">
              Comment on {formatRange(normalizeRange(selectedRange).start, normalizeRange(selectedRange).end)}
            </div>
            <Input
              ref={composerInputRef}
              value={draftComment}
              onChange={(e) => setDraftComment(e.target.value)}
              placeholder="Type comment"
              className="h-7 border-[#3a3d48] bg-[#10131a] text-xs"
            />
            <div className="mt-2 flex items-center gap-1">
              <Button size="sm" variant="secondary" onClick={onAddComment} disabled={!draftComment.trim() || !activePath}>
                Add
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelComment}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
