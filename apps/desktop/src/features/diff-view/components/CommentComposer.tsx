import { useRef, useState } from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'

import { useAppDispatch } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addComment } from '@/features/comments/actions'
import type { SelectionRange } from '@/features/source-control/types'

type Props = {
  visible: boolean
  top: number
  left: number
  label: string
  activePath: string
  selectedRange: SelectionRange | null
  onClose: () => void
}

export function CommentComposer({
  visible,
  top,
  left,
  label,
  activePath,
  selectedRange,
  onClose,
}: Props) {
  const dispatch = useAppDispatch()
  const [draftComment, setDraftComment] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  const onCancel = () => {
    setDraftComment('')
    onClose()
  }

  const onSubmit = () => {
    if (!selectedRange || !draftComment.trim() || !activePath) return
    dispatch(addComment(selectedRange, draftComment))
    setDraftComment('')
    onClose()
  }

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
      className="border-input bg-surface-elevated absolute z-20 w-80 border p-2 shadow-xl"
      style={{ top, left }}
    >
      <div className="text-foreground/90 mb-1 text-[11px]">Comment on {label}</div>
      <Input
        ref={inputRef}
        value={draftComment}
        autoFocus
        onChange={(event) => setDraftComment(event.target.value)}
        placeholder="Type comment"
        className="border-input bg-input h-7 text-xs"
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
