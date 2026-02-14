import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { parseDiffFromFile } from '@pierre/diffs'
import { FileDiff as PierreFileDiff, Virtualizer } from '@pierre/diffs/react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
    fileComments,
    removeComment,
    toLineAnnotations
} from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import type {
    CommentItem,
    DiffFile,
    SelectionRange
} from '@/features/source-control/types'
import { CommentAnnotation } from '@/features/diff-view/components/CommentAnnotation'
import { CommentComposer } from '@/features/diff-view/components/CommentComposer'
import {
    areRangesEqual,
    formatRange,
    normalizeRange,
    parseSelectionRange
} from '@/features/source-control/utils'

type Props = {
    oldFile: DiffFile | null
    newFile: DiffFile | null
    canComment: boolean
}

type ComposerPosition = { top: number; left: number; visible: boolean }

function updateComposerPositionForRange(
    viewport: HTMLDivElement | null,
    selectedRange: SelectionRange | null,
    setComposerPos: React.Dispatch<React.SetStateAction<ComposerPosition>>
) {
    if (!viewport || !selectedRange) {
        setComposerPos(prev =>
            prev.visible ? { ...prev, visible: false } : prev
        )
        return
    }

    const diffContainer = viewport.querySelector('diffs-container')
    const shadowRoot =
        diffContainer instanceof HTMLElement ? diffContainer.shadowRoot : null
    const selectedRows = shadowRoot
        ? Array.from(
              shadowRoot.querySelectorAll<HTMLElement>('[data-selected-line]')
          )
        : Array.from(
              viewport.querySelectorAll<HTMLElement>('[data-selected-line]')
          )

    if (selectedRows.length === 0) {
        const nextTop = viewport.scrollTop + 32
        const nextLeft = 12
        setComposerPos(prev => {
            if (prev.visible && prev.top === nextTop && prev.left === nextLeft)
                return prev
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
        Math.min(
            anchorRect.left - viewportRect.left + viewport.scrollLeft,
            viewport.clientWidth - 320
        )
    )

    setComposerPos(prev => {
        if (prev.visible && prev.top === top && prev.left === left) return prev
        return { top, left, visible: true }
    })
}

export function DiffWorkspace({ oldFile, newFile, canComment }: Props) {
    const dispatch = useAppDispatch()
    const activeRepo = useAppSelector(state => state.sourceControl.activeRepo)
    const activePath = useAppSelector(state => state.sourceControl.activePath)
    const diffStyle = useAppSelector(state => state.sourceControl.diffStyle)
    const comments = useAppSelector(state => state.comments)

    const diffViewportContainerRef = useRef<HTMLDivElement | null>(null)
    const diffViewportRef = useRef<HTMLDivElement | null>(null)
    const composerScrollRafRef = useRef<number | null>(null)

    const [selectedRange, setSelectedRange] = useState<SelectionRange | null>(
        null
    )
    const [composerPos, setComposerPos] = useState<ComposerPosition>({
        top: 0,
        left: 0,
        visible: false
    })

    const allComments = compactComments(comments)
    const currentFileComments = canComment
        ? fileComments(allComments, activeRepo, activePath)
        : []
    const currentAnnotations = toLineAnnotations(currentFileComments)
    const currentFileDiff =
        activePath && (oldFile || newFile)
            ? parseDiffFromFile(
                  oldFile ?? { name: activePath, contents: '' },
                  newFile ?? { name: activePath, contents: '' }
              )
            : null

    const onDiffViewportScroll = useCallback(() => {
        if (!selectedRange) return
        if (composerScrollRafRef.current != null) return
        composerScrollRafRef.current = window.requestAnimationFrame(() => {
            composerScrollRafRef.current = null
            updateComposerPositionForRange(
                diffViewportRef.current,
                selectedRange,
                setComposerPos
            )
        })
    }, [selectedRange])

    useEffect(() => {
        const container = diffViewportContainerRef.current
        const viewport = container?.firstElementChild
        if (!(viewport instanceof HTMLDivElement)) return

        diffViewportRef.current = viewport
        viewport.addEventListener('scroll', onDiffViewportScroll, {
            passive: true
        })

        return () => {
            viewport.removeEventListener('scroll', onDiffViewportScroll)
            if (diffViewportRef.current === viewport)
                diffViewportRef.current = null
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
            updateComposerPositionForRange(
                diffViewportRef.current,
                selectedRange,
                setComposerPos
            )
        })
        return () => window.cancelAnimationFrame(id)
    }, [selectedRange])

    const applySelectionRange = (range: unknown) => {
        const parsedRange = parseSelectionRange(range)
        if (areRangesEqual(selectedRange, parsedRange)) return
        setSelectedRange(parsedRange)
    }

    const onLineSelectionEnd = (range: unknown) => {
        const parsedRange = parseSelectionRange(range)
        if (areRangesEqual(selectedRange, parsedRange)) return
        setSelectedRange(parsedRange)
        window.requestAnimationFrame(() => {
            updateComposerPositionForRange(
                diffViewportRef.current,
                parsedRange,
                setComposerPos
            )
        })
    }

    const renderCommentAnnotation = (annotation: {
        metadata?: CommentItem
    }) => {
        const data = annotation.metadata
        if (!data) return null

        return <CommentAnnotation comment={data} />
    }

    const diffOptions = {
        diffStyle,
        themeType: 'dark' as const,
        disableLineNumbers: false,
        expandUnchanged: false,
        expansionLineCount: 20,
        hunkSeparators: 'line-info' as const,
        enableLineSelection: canComment,
        onLineSelected: canComment ? applySelectionRange : undefined,
        onLineSelectionEnd: canComment ? onLineSelectionEnd : undefined
    }

    const onCloseCommentComposer = () => {
        setSelectedRange(null)
        setComposerPos(prev => ({ ...prev, visible: false }))
    }

    const normalizedRange = selectedRange ? normalizeRange(selectedRange) : null
    const selectedRangeLabel = normalizedRange
        ? formatRange(normalizedRange.start, normalizedRange.end)
        : ''

    return (
        <div className='flex h-full min-h-0 flex-col'>
            {canComment && currentFileComments.length > 0 ? (
                <div className='border-b border-[#2f3138] px-2 py-1'>
                    <div className='space-y-1'>
                        {currentFileComments.map(comment => (
                            <div
                                key={comment.id}
                                className='flex items-center gap-2 bg-[#23262f] px-2 py-1 text-[11px]'
                            >
                                <span className='text-[#8f96a8]'>
                                    {formatRange(
                                        comment.startLine,
                                        comment.endLine
                                    )}
                                </span>
                                <span className='truncate'>{comment.text}</span>
                                <button
                                    type='button'
                                    className='ml-auto text-[#9ea7bb] hover:text-white'
                                    onClick={() =>
                                        dispatch(removeComment(comment.id))
                                    }
                                    title='Remove'
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
                className='relative min-h-0 flex-1'
            >
                <Virtualizer
                    className='h-full overflow-auto'
                    contentClassName='relative min-h-full'
                >
                    {currentFileDiff ? (
                        <PierreFileDiff
                            fileDiff={currentFileDiff}
                            selectedLines={selectedRange}
                            lineAnnotations={currentAnnotations}
                            renderAnnotation={renderCommentAnnotation}
                            options={diffOptions}
                        />
                    ) : (
                        <div className='p-3 text-xs text-[#8f96a8]'>
                            No diff content.
                        </div>
                    )}

                    <CommentComposer
                        visible={
                            canComment && !!selectedRange && composerPos.visible
                        }
                        top={composerPos.top}
                        left={composerPos.left}
                        label={selectedRangeLabel}
                        activePath={activePath}
                        selectedRange={selectedRange}
                        onClose={onCloseCommentComposer}
                    />
                </Virtualizer>
            </div>
        </div>
    )
}
