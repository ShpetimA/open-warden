import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { removeComment, removeCommentsByIds } from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import { formatRange } from '@/features/source-control/utils'

type ContextFilter = 'all' | 'changes' | 'review'

export function CommentsScreen() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const comments = useAppSelector((state) => state.comments)
  const [searchText, setSearchText] = useState('')
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all')
  const [selectedPair, setSelectedPair] = useState('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const allComments = compactComments(comments)
  const repoComments = activeRepo
    ? allComments.filter((comment) => comment.repoPath === activeRepo)
    : allComments

  const reviewPairs = useMemo(() => {
    const unique = new Set<string>()
    for (const comment of repoComments) {
      if (comment.contextKind !== 'review' || !comment.baseRef || !comment.headRef) continue
      unique.add(`${comment.baseRef} -> ${comment.headRef}`)
    }
    return Array.from(unique).sort()
  }, [repoComments])

  const filteredComments = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return repoComments.filter((comment) => {
      const contextKind = comment.contextKind ?? 'changes'
      if (contextFilter !== 'all' && contextKind !== contextFilter) return false
      if (selectedPair !== 'all') {
        const pair = `${comment.baseRef ?? ''} -> ${comment.headRef ?? ''}`
        if (pair !== selectedPair) return false
      }
      if (!query) return true
      return (
        comment.filePath.toLowerCase().includes(query) ||
        comment.text.toLowerCase().includes(query) ||
        `${comment.baseRef ?? ''} ${comment.headRef ?? ''}`.toLowerCase().includes(query)
      )
    })
  }, [contextFilter, repoComments, searchText, selectedPair])

  useEffect(() => {
    const visibleIds = new Set(filteredComments.map((comment) => comment.id))
    setSelectedIds((prev) => prev.filter((id) => visibleIds.has(id)))
  }, [filteredComments])

  useEffect(() => {
    if (selectedPair !== 'all' && !reviewPairs.includes(selectedPair)) {
      setSelectedPair('all')
    }
  }, [reviewPairs, selectedPair])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const allVisibleSelected =
    filteredComments.length > 0 && filteredComments.every((comment) => selectedIds.includes(comment.id))

  const onToggleAllVisible = () => {
    if (allVisibleSelected) {
      const visibleSet = new Set(filteredComments.map((comment) => comment.id))
      setSelectedIds((prev) => prev.filter((id) => !visibleSet.has(id)))
      return
    }
    const nextIds = new Set(selectedIds)
    for (const comment of filteredComments) {
      nextIds.add(comment.id)
    }
    setSelectedIds(Array.from(nextIds))
  }

  const onDeleteSelected = () => {
    if (selectedIds.length === 0) return
    dispatch(removeCommentsByIds(selectedIds))
    setSelectedIds([])
  }

  const onDeleteVisible = () => {
    if (filteredComments.length === 0) return
    dispatch(removeCommentsByIds(filteredComments.map((comment) => comment.id)))
    setSelectedIds([])
  }

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="border-border bg-surface flex flex-wrap items-center gap-2 border-b px-2 py-1">
        <Input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          placeholder="Search comments"
          className="h-7 w-56 text-xs"
        />
        <Select
          value={contextFilter}
          onValueChange={(value) => {
            if (value === 'all' || value === 'changes' || value === 'review') {
              setContextFilter(value)
            }
          }}
        >
          <SelectTrigger className="h-7 w-36 text-xs">
            <SelectValue placeholder="Context" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Contexts</SelectItem>
            <SelectItem value="changes">Changes</SelectItem>
            <SelectItem value="review">Branch Review</SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedPair} onValueChange={setSelectedPair}>
          <SelectTrigger className="h-7 w-56 text-xs">
            <SelectValue placeholder="Review pair" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Review Pairs</SelectItem>
            {reviewPairs.map((pair) => (
              <SelectItem key={pair} value={pair}>
                {pair}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button size="sm" variant="outline" onClick={onToggleAllVisible} disabled={filteredComments.length === 0}>
          {allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}
        </Button>
        <Button size="sm" variant="outline" onClick={onDeleteSelected} disabled={selectedIds.length === 0}>
          Delete Selected ({selectedIds.length})
        </Button>
        <Button size="sm" variant="outline" onClick={onDeleteVisible} disabled={filteredComments.length === 0}>
          Delete Visible ({filteredComments.length})
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filteredComments.length === 0 ? (
          <div className="text-muted-foreground p-3 text-sm">No comments found.</div>
        ) : (
          filteredComments.map((comment) => {
            const isSelected = selectedIds.includes(comment.id)
            const contextKind = comment.contextKind ?? 'changes'
            const reviewLabel =
              contextKind === 'review' && comment.baseRef && comment.headRef
                ? `${comment.baseRef} -> ${comment.headRef}`
                : 'changes'

            return (
              <div
                key={comment.id}
                className={`border-border flex items-center gap-2 border-b px-2 py-1 text-xs ${
                  isSelected ? 'bg-accent/50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelected(comment.id)}
                  aria-label={`Select comment ${comment.id}`}
                />
                <span className="text-muted-foreground shrink-0">{formatRange(comment.startLine, comment.endLine)}</span>
                <span className="text-foreground shrink-0 font-medium">{comment.filePath}</span>
                <span className="text-muted-foreground shrink-0">{reviewLabel}</span>
                <span className="min-w-0 flex-1 truncate">{comment.text}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive p-1"
                  onClick={() => dispatch(removeComment(comment.id))}
                  title="Delete comment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
