import { useEffect, useRef, useState } from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'

import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addComment } from '@/features/comments/actions'
import type { CommentContext, SelectionRange } from '@/features/source-control/types'

type Props = {
  visible: boolean
  label: string
  activePath: string
  selectedRange: SelectionRange | null
  commentContext: CommentContext
  onClose: () => void
  onBeforeSubmit?: () => void
}

export function CommentComposer({
  visible,
  label,
  activePath,
  selectedRange,
  commentContext,
  onClose,
  onBeforeSubmit,
}: Props) {
  const dispatch = useAppDispatch()
  const [draftComment, setDraftComment] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const resizeComposer = () => {
    const input = inputRef.current
    if (!input) return

    input.style.height = '0px'
    input.style.height = `${input.scrollHeight}px`
  }

  const onCancel = () => {
    setDraftComment('')
    onClose()
  }

  const onSubmit = () => {
    if (!selectedRange || !draftComment.trim() || !activePath) return
    onBeforeSubmit?.()
    dispatch(addComment(selectedRange, draftComment, commentContext))
    setDraftComment('')
    onClose()
  }

  useEffect(() => {
    if (visible) {
      resizeComposer()
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [visible])

  useEffect(() => {
    resizeComposer()
  }, [draftComment])

  useHotkey(
    'Mod+Enter',
    (event) => {
      event.preventDefault()
      onSubmit()
    },
    { target: inputRef, enabled: visible, ignoreInputs: false },
  )

  useHotkey(
    'Escape',
    (event) => {
      event.preventDefault()
      onCancel()
    },
    { target: inputRef, enabled: visible, ignoreInputs: false },
  )

  if (!visible) return null

  return (
    <div
      className="border-input bg-surface-elevated border p-2 shadow-xl"
    >
      <div className="text-foreground/90 mb-1 text-[11px]">Comment on {label}</div>
      <Textarea
        ref={inputRef}
        value={draftComment}
        onChange={(event) => setDraftComment(event.target.value)}
        placeholder="Type comment"
        rows={1}
        className="border-input bg-input min-h-7 resize-none overflow-hidden px-2 py-1.5 text-xs"
      />
      <div className="mt-2 flex items-center gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={onSubmit}
          disabled={!draftComment.trim() || !activePath}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
