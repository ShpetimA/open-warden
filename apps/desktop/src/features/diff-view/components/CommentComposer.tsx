import { useEffect, useRef, useState } from 'react'

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

export function CommentComposer({ visible, top, left, label, activePath, selectedRange, onClose }: Props) {
  const dispatch = useAppDispatch()
  const [draftComment, setDraftComment] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!visible) return
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(id)
  }, [visible])

  useEffect(() => {
    if (visible) return
    if (!draftComment) return
    setDraftComment('')
  }, [visible, draftComment])

  const onSubmit = () => {
    if (!selectedRange || !draftComment.trim() || !activePath) return
    dispatch(addComment(selectedRange, draftComment))
    setDraftComment('')
    onClose()
  }

  if (!visible) return null

  return (
    <div className="absolute z-20 w-80 border border-[#3a3d48] bg-[#1a1d25] p-2 shadow-xl" style={{ top, left }}>
      <div className="mb-1 text-[11px] text-[#c5cada]">Comment on {label}</div>
      <Input
        ref={inputRef}
        value={draftComment}
        onChange={(event) => setDraftComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onSubmit()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }}
        placeholder="Type comment"
        className="h-7 border-[#3a3d48] bg-[#10131a] text-xs"
      />
      <div className="mt-2 flex items-center gap-1">
        <Button size="sm" variant="secondary" onClick={onSubmit} disabled={!draftComment.trim() || !activePath}>
          Add
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
