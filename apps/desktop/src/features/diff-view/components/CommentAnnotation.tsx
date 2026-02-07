import { Check, Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'

import { Input } from '@/components/ui/input'
import { removeComment, updateComment } from '@/features/comments/actions'
import type { CommentItem } from '@/features/source-control/types'

type Props = {
  comment: CommentItem
}

export function CommentAnnotation({ comment }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [editingText, setEditingText] = useState(comment.text)

  const onStartEdit = () => {
    setEditingText(comment.text)
    setIsEditing(true)
  }

  const onCancelEdit = () => {
    setEditingText(comment.text)
    setIsEditing(false)
  }

  const onSaveEdit = () => {
    if (!editingText.trim()) return
    updateComment(comment.id, editingText)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="bg-accent text-accent-foreground flex max-w-[28rem] items-center gap-1 p-1 text-[10px]">
        <Input
          value={editingText}
          onChange={(event) => setEditingText(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              onSaveEdit()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancelEdit()
            }
          }}
          className="h-6 min-w-0 flex-1 border-[#3a3d48] bg-[#10131a] px-1 text-[10px]"
        />

        <button
          type="button"
          className="text-[#9ea7bb] hover:text-white"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onSaveEdit}
          title="Save"
        >
          <Check className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="text-[#9ea7bb] hover:text-white"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={onCancelEdit}
          title="Cancel"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-accent text-accent-foreground group flex max-w-[28rem] items-center gap-1 p-1 text-[10px]">
      <span className="min-w-0 flex-1 truncate">{comment.text}</span>
      <button
        type="button"
        className="text-[#9ea7bb] hover:text-white"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={onStartEdit}
        title="Edit"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="text-[#9ea7bb] hover:text-white"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => removeComment(comment.id)}
        title="Remove"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}
