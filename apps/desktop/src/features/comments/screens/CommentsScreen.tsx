import { useHotkey } from '@tanstack/react-hotkeys'
import { confirm } from '@tauri-apps/plugin-dialog'
import { ArrowUpRight, Copy, MessageSquare, Trash2 } from 'lucide-react'
import { useRef, useState, type RefObject } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ResizableSidebarLayout } from '@/components/layout/ResizableSidebarLayout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { removeComment, removeCommentsByIds } from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import {
  commentContextLabel,
  commentsForRepo,
  createFileFilterOptions,
  createReviewPairOptions,
  filterCommentsByFile,
  filterCommentsByScope,
  filterCommentsBySearch,
  groupCommentsByFile,
  isReviewComment,
  splitFilePath,
  type CommentFileGroup,
  type ContextFilter,
  type FileFilterOption,
  type ReviewPairOption,
} from '@/features/comments/screens/commentsScreenModel'
import { selectFile } from '@/features/source-control/actions'
import { setReviewActivePath, setReviewBaseRef, setReviewHeadRef } from '@/features/source-control/sourceControlSlice'
import type { CommentItem } from '@/features/source-control/types'
import { formatRange, isTypingTarget, repoLabel } from '@/features/source-control/utils'

function nextFocusedCommentId(
  comments: CommentItem[],
  focusedCommentId: string | null,
  goForward: boolean,
): string | null {
  if (comments.length === 0) return null

  if (!focusedCommentId) {
    return goForward ? comments[0].id : comments[comments.length - 1].id
  }

  const activeIndex = comments.findIndex((comment) => comment.id === focusedCommentId)
  if (activeIndex < 0) {
    return goForward ? comments[0].id : comments[comments.length - 1].id
  }

  if (goForward) {
    return comments[Math.min(activeIndex + 1, comments.length - 1)]?.id ?? null
  }

  return comments[Math.max(activeIndex - 1, 0)]?.id ?? null
}

async function confirmDeleteComments(count: number, scopeLabel: string): Promise<boolean> {
  if (count <= 1) return true

  const message = `Delete ${count} ${scopeLabel} comment${count === 1 ? '' : 's'}?`

  try {
    return await confirm(message, {
      title: 'Delete Comments',
      kind: 'warning',
      okLabel: 'Delete',
      cancelLabel: 'Cancel',
    })
  } catch {
    return window.confirm(message)
  }
}

function summaryLabel(count: number, singular: string, plural: string): string {
  if (count === 1) return `1 ${singular}`
  return `${count} ${plural}`
}

function copyPayloadForComments(comments: CommentItem[]): string {
  return comments.map((comment) => `@${comment.filePath}#${formatRange(comment.startLine, comment.endLine)} - ${comment.text}`).join('\n')
}

type CommentsSidebarFiltersProps = {
  searchInputRef: RefObject<HTMLInputElement | null>
  searchText: string
  onSearchTextChange: (value: string) => void
  contextFilter: ContextFilter
  onContextFilterChange: (value: ContextFilter) => void
  selectedPair: string | null
  onSelectedPairChange: (value: string | null) => void
  reviewPairs: ReviewPairOption[]
  selectedFilePath: string | null
  onSelectedFilePathChange: (value: string | null) => void
  fileFilters: FileFilterOption[]
  matchingCommentsCount: number
  hasActiveFilters: boolean
  onClearFilters: () => void
}

function CommentsSidebarFilters({
  searchInputRef,
  searchText,
  onSearchTextChange,
  contextFilter,
  onContextFilterChange,
  selectedPair,
  onSelectedPairChange,
  reviewPairs,
  selectedFilePath,
  onSelectedFilePathChange,
  fileFilters,
  matchingCommentsCount,
  hasActiveFilters,
  onClearFilters,
}: CommentsSidebarFiltersProps) {
  const contextFilterButtons: Array<{ value: ContextFilter; label: string }> = [
    { value: 'all', label: 'All' },
    { value: 'changes', label: 'Changes' },
    { value: 'review', label: 'Review' },
  ]

  return (
    <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
      <div className="border-border border-b p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">COMMENT FILTERS</div>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {summaryLabel(matchingCommentsCount, 'match', 'matches')}
          </Badge>
        </div>

        <div className="mt-2 space-y-2.5">
          <Input
            ref={searchInputRef}
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder="Search text, file, branch"
            className="h-8 text-xs"
          />

          <div className="space-y-1">
            <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
              Context
            </div>
            <div className="grid grid-cols-3 gap-1">
              {contextFilterButtons.map((filterButton) => (
                <Button
                  key={filterButton.value}
                  size="xs"
                  variant={contextFilter === filterButton.value ? 'secondary' : 'outline'}
                  onClick={() => onContextFilterChange(filterButton.value)}
                  className="w-full"
                >
                  {filterButton.label}
                </Button>
              ))}
            </div>
          </div>

          {contextFilter === 'review' ? (
            <div className="space-y-1">
              <div className="text-muted-foreground text-[10px] font-semibold tracking-[0.12em] uppercase">
                Review Pair
              </div>
              <Select
                value={selectedPair ?? 'all'}
                onValueChange={(value) => onSelectedPairChange(value === 'all' ? null : value)}
                disabled={reviewPairs.length === 0}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Review pair" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Pairs</SelectItem>
                  {reviewPairs.map((pair) => (
                    <SelectItem key={pair.value} value={pair.value}>
                      {pair.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px]">
              {summaryLabel(matchingCommentsCount, 'comment', 'comments')}
            </span>
            <Button size="xs" variant="ghost" onClick={onClearFilters} disabled={!hasActiveFilters}>
              Clear filters
            </Button>
          </div>
        </div>
      </div>

      <div className="border-border min-h-0 flex-1 border-t">
        <div className="border-border flex items-center justify-between border-b px-2.5 py-2">
          <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">FILES</div>
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {fileFilters.length}
          </Badge>
        </div>

        <ScrollArea className="h-full">
          <div className="p-1">
            <FileFilterButton
              pathLabel="All files"
              count={matchingCommentsCount}
              isActive={selectedFilePath === null}
              onClick={() => onSelectedFilePathChange(null)}
            />

            {fileFilters.map((fileFilter) => (
              <FileFilterButton
                key={fileFilter.path}
                pathLabel={fileFilter.path}
                count={fileFilter.count}
                isActive={selectedFilePath === fileFilter.path}
                onClick={() => onSelectedFilePathChange(fileFilter.path)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}

type FileFilterButtonProps = {
  pathLabel: string
  count: number
  isActive: boolean
  onClick: () => void
}

function FileFilterButton({ pathLabel, count, isActive, onClick }: FileFilterButtonProps) {
  const { fileName, directoryPath } = splitFilePath(pathLabel)
  const stateClass = isActive
    ? 'border-ring/30 bg-surface-active'
    : 'border-transparent hover:border-input hover:bg-accent/45'

  return (
    <button
      type="button"
      className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${stateClass}`}
      onClick={onClick}
      title={pathLabel}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-foreground min-w-0 flex-1 truncate font-medium">{fileName}</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
          {count}
        </Badge>
      </div>
      {directoryPath ? (
        <div className="text-muted-foreground mt-0.5 truncate text-[11px]">{directoryPath}</div>
      ) : null}
    </button>
  )
}

type CommentGroupListProps = {
  groups: CommentFileGroup[]
  selectedIdSet: Set<string>
  focusedCommentId: string | null
  onToggleSelected: (commentId: string) => void
  onFocusComment: (commentId: string) => void
  onOpenComment: (comment: CommentItem) => void
  onCopyComment: (comment: CommentItem) => void
  onDeleteComment: (comment: CommentItem) => void
}

function CommentGroupList({
  groups,
  selectedIdSet,
  focusedCommentId,
  onToggleSelected,
  onFocusComment,
  onOpenComment,
  onCopyComment,
  onDeleteComment,
}: CommentGroupListProps) {
  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-3">
        {groups.map((group) => (
          <CommentFileSection
            key={group.path}
            group={group}
            selectedIdSet={selectedIdSet}
            focusedCommentId={focusedCommentId}
            onToggleSelected={onToggleSelected}
            onFocusComment={onFocusComment}
            onOpenComment={onOpenComment}
            onCopyComment={onCopyComment}
            onDeleteComment={onDeleteComment}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

type CommentFileSectionProps = {
  group: CommentFileGroup
  selectedIdSet: Set<string>
  focusedCommentId: string | null
  onToggleSelected: (commentId: string) => void
  onFocusComment: (commentId: string) => void
  onOpenComment: (comment: CommentItem) => void
  onCopyComment: (comment: CommentItem) => void
  onDeleteComment: (comment: CommentItem) => void
}

function CommentFileSection({
  group,
  selectedIdSet,
  focusedCommentId,
  onToggleSelected,
  onFocusComment,
  onOpenComment,
  onCopyComment,
  onDeleteComment,
}: CommentFileSectionProps) {
  const { fileName, directoryPath } = splitFilePath(group.path)

  return (
    <section className="border-border bg-surface overflow-hidden rounded-md border">
      <header className="border-border bg-surface-alt flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-foreground truncate text-sm font-medium">{fileName}</div>
          {directoryPath ? (
            <div className="text-muted-foreground truncate text-xs">{directoryPath}</div>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {summaryLabel(group.comments.length, 'comment', 'comments')}
          </Badge>
          {group.reviewCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {summaryLabel(group.reviewCount, 'review', 'reviews')}
            </Badge>
          ) : null}
        </div>
      </header>

      <div className="divide-border divide-y">
        {group.comments.map((comment) => (
          <CommentListRow
            key={comment.id}
            comment={comment}
            isSelected={selectedIdSet.has(comment.id)}
            isFocused={focusedCommentId === comment.id}
              onToggleSelected={onToggleSelected}
              onFocusComment={onFocusComment}
              onOpenComment={onOpenComment}
              onCopyComment={onCopyComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
      </div>
    </section>
  )
}

function commentRowClassName(isFocused: boolean, isSelected: boolean): string {
  if (isFocused) return 'bg-surface-active'
  if (isSelected) return 'bg-accent/45'
  return 'hover:bg-accent/35'
}

type CommentListRowProps = {
  comment: CommentItem
  isSelected: boolean
  isFocused: boolean
  onToggleSelected: (commentId: string) => void
  onFocusComment: (commentId: string) => void
  onOpenComment: (comment: CommentItem) => void
  onCopyComment: (comment: CommentItem) => void
  onDeleteComment: (comment: CommentItem) => void
}

function CommentListRow({
  comment,
  isSelected,
  isFocused,
  onToggleSelected,
  onFocusComment,
  onOpenComment,
  onCopyComment,
  onDeleteComment,
}: CommentListRowProps) {
  return (
    <div
      className={`group px-3 py-2 text-xs ${commentRowClassName(isFocused, isSelected)}`}
      onClick={() => onFocusComment(comment.id)}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelected(comment.id)}
          aria-label={`Select comment ${comment.id}`}
          className="mt-0.5"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              {formatRange(comment.startLine, comment.endLine)}
            </Badge>
            <Badge
              variant={isReviewComment(comment) ? 'secondary' : 'outline'}
              className="px-1.5 py-0 text-[10px]"
            >
              {isReviewComment(comment) ? 'Review' : 'Changes'}
            </Badge>
            <span className="text-muted-foreground truncate text-[11px]">{commentContextLabel(comment)}</span>
          </div>

          <p className="text-foreground mt-1 whitespace-pre-wrap break-words">{comment.text}</p>
        </div>

        <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          <Button
            size="xs"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onOpenComment(comment)
            }}
          >
            Open
            <ArrowUpRight className="h-3 w-3" />
          </Button>

          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onCopyComment(comment)
            }}
            title="Copy comment"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          <Button
            size="icon-xs"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation()
              onDeleteComment(comment)
            }}
            title="Delete comment"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}

type CommentsEmptyStateProps = {
  hasComments: boolean
  hasActiveFilters: boolean
  onClearFilters: () => void
}

function CommentsEmptyState({ hasComments, hasActiveFilters, onClearFilters }: CommentsEmptyStateProps) {
  const title = hasComments ? 'No comments match your filters' : 'No comments yet'
  const description = hasComments
    ? 'Try broadening your search or clearing one of the active filters.'
    : 'Add comments from Changes or Review and they will appear here.'

  return (
    <Empty className="border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquare className="size-4" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>

      {hasActiveFilters ? (
        <EmptyContent>
          <Button size="sm" variant="outline" onClick={onClearFilters}>
            Clear filters
          </Button>
        </EmptyContent>
      ) : null}
    </Empty>
  )
}

export function CommentsScreen() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const comments = useAppSelector((state) => state.comments)

  const [searchText, setSearchText] = useState('')
  const [contextFilter, setContextFilter] = useState<ContextFilter>('all')
  const [selectedPair, setSelectedPair] = useState<string | null>(null)
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [focusedCommentId, setFocusedCommentId] = useState<string | null>(null)

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const allComments = compactComments(comments)
  const repoComments = commentsForRepo(allComments, activeRepo)
  const reviewPairs = createReviewPairOptions(repoComments)
  const reviewPairIsAvailable = selectedPair ? reviewPairs.some((pair) => pair.value === selectedPair) : false
  const effectiveSelectedPair =
    contextFilter === 'review' && reviewPairIsAvailable ? selectedPair : null

  const scopedComments = filterCommentsByScope(repoComments, contextFilter, effectiveSelectedPair)
  const searchedComments = filterCommentsBySearch(scopedComments, searchText)
  const fileFilters = createFileFilterOptions(searchedComments)
  const fileFilterIsAvailable = selectedFilePath
    ? fileFilters.some((fileFilter) => fileFilter.path === selectedFilePath)
    : false
  const effectiveSelectedFilePath = fileFilterIsAvailable ? selectedFilePath : null

  const visibleComments = filterCommentsByFile(searchedComments, effectiveSelectedFilePath)
  const groupedComments = groupCommentsByFile(visibleComments)

  const visibleIdSet = new Set(visibleComments.map((comment) => comment.id))
  const visibleSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id))
  const selectedIdSet = new Set(visibleSelectedIds)
  const allVisibleSelected =
    visibleComments.length > 0 && visibleComments.every((comment) => selectedIdSet.has(comment.id))

  const hasActiveFilters =
    searchText.trim().length > 0 ||
    contextFilter !== 'all' ||
    effectiveSelectedPair !== null ||
    effectiveSelectedFilePath !== null

  const focusedIdExists = focusedCommentId
    ? visibleComments.some((comment) => comment.id === focusedCommentId)
    : false
  const effectiveFocusedCommentId = focusedIdExists
    ? focusedCommentId
    : (visibleComments[0]?.id ?? null)
  const focusedComment = effectiveFocusedCommentId
    ? visibleComments.find((comment) => comment.id === effectiveFocusedCommentId) ?? null
    : null

  const onToggleSelected = (commentId: string) => {
    if (selectedIdSet.has(commentId)) {
      setSelectedIds(visibleSelectedIds.filter((id) => id !== commentId))
      return
    }

    setSelectedIds([...visibleSelectedIds, commentId])
  }

  const onToggleAllVisible = () => {
    if (visibleComments.length === 0) return

    if (allVisibleSelected) {
      const visibleIdSet = new Set(visibleComments.map((comment) => comment.id))
      setSelectedIds(visibleSelectedIds.filter((id) => !visibleIdSet.has(id)))
      return
    }

    const nextIdSet = new Set(visibleSelectedIds)
    for (const comment of visibleComments) {
      nextIdSet.add(comment.id)
    }

    setSelectedIds(Array.from(nextIdSet))
  }

  const onOpenComment = (comment: CommentItem) => {
    if (isReviewComment(comment) && comment.baseRef && comment.headRef) {
      dispatch(setReviewBaseRef(comment.baseRef))
      dispatch(setReviewHeadRef(comment.headRef))
      dispatch(setReviewActivePath(comment.filePath))
      navigate('/review')
      return
    }

    void dispatch(selectFile(comment.bucket, comment.filePath))
    navigate('/changes')
  }

  const onDeleteComment = (comment: CommentItem) => {
    dispatch(removeComment(comment.id))
    setSelectedIds((previousIds) => previousIds.filter((id) => id !== comment.id))
  }

  const onCopyComments = async (targetComments: CommentItem[], label: string) => {
    if (targetComments.length === 0) return

    try {
      await navigator.clipboard.writeText(copyPayloadForComments(targetComments))
      toast.success(`Copied ${label}`)
    } catch {
      toast.error('Unable to copy comments')
    }
  }

  const onCopyComment = (comment: CommentItem) => {
    void onCopyComments([comment], 'comment')
  }

  const onCopySelected = () => {
    const selectedComments = visibleComments.filter((comment) => selectedIdSet.has(comment.id))
    void onCopyComments(selectedComments, summaryLabel(selectedComments.length, 'comment', 'comments'))
  }

  const onCopyVisible = () => {
    void onCopyComments(visibleComments, summaryLabel(visibleComments.length, 'comment', 'comments'))
  }

  const onDeleteSelected = async () => {
    if (visibleSelectedIds.length === 0) return

    const confirmed = await confirmDeleteComments(visibleSelectedIds.length, 'selected')
    if (!confirmed) return

    dispatch(removeCommentsByIds(visibleSelectedIds))
    setSelectedIds([])
  }

  const onDeleteVisible = async () => {
    if (visibleComments.length === 0) return

    const ids = visibleComments.map((comment) => comment.id)
    const confirmed = await confirmDeleteComments(ids.length, 'visible')
    if (!confirmed) return

    dispatch(removeCommentsByIds(ids))
    setSelectedIds([])
  }

  const onClearSelection = () => {
    setSelectedIds([])
  }

  const onClearFilters = () => {
    setSearchText('')
    setContextFilter('all')
    setSelectedPair(null)
    setSelectedFilePath(null)
    setSelectedIds([])
  }

  const onSearchTextChange = (value: string) => {
    setSearchText(value)
    setSelectedIds([])
  }

  const onContextFilterChange = (value: ContextFilter) => {
    setContextFilter(value)
    if (value !== 'review') {
      setSelectedPair(null)
    }
    setSelectedIds([])
  }

  const onSelectedPairChange = (value: string | null) => {
    setSelectedPair(value)
    setSelectedIds([])
  }

  const onSelectedFilePathChange = (value: string | null) => {
    setSelectedFilePath(value)
    setSelectedIds([])
  }

  const focusSearchInput = (event: KeyboardEvent) => {
    if (isTypingTarget(event.target)) return

    event.preventDefault()
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }

  const onMoveFocus = (event: KeyboardEvent, goForward: boolean) => {
    if (isTypingTarget(event.target)) return

    event.preventDefault()
    const nextId = nextFocusedCommentId(visibleComments, effectiveFocusedCommentId, goForward)
    if (!nextId) return
    setFocusedCommentId(nextId)
  }

  useHotkey('/', (event) => focusSearchInput(event), {
    ignoreInputs: false,
    preventDefault: false,
    stopPropagation: false,
  })

  useHotkey(
    { key: '?' },
    (event) => focusSearchInput(event),
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  )

  useHotkey(
    'ArrowDown',
    (event) => {
      onMoveFocus(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'J',
    (event) => {
      onMoveFocus(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'ArrowUp',
    (event) => {
      onMoveFocus(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'K',
    (event) => {
      onMoveFocus(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'X',
    (event) => {
      if (isTypingTarget(event.target)) return
      if (!effectiveFocusedCommentId) return

      event.preventDefault()
      onToggleSelected(effectiveFocusedCommentId)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'A',
    (event) => {
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      onToggleAllVisible()
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'Enter',
    (event) => {
      if (isTypingTarget(event.target)) return
      if (!focusedComment) return

      event.preventDefault()
      onOpenComment(focusedComment)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'Mod+C',
    (event) => {
      if (isTypingTarget(event.target)) return
      if (visibleSelectedIds.length > 0) {
        event.preventDefault()
        onCopySelected()
        return
      }
      if (!focusedComment) return

      event.preventDefault()
      onCopyComment(focusedComment)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'Backspace',
    (event) => {
      if (isTypingTarget(event.target)) return
      if (visibleSelectedIds.length === 0) return

      event.preventDefault()
      void onDeleteSelected()
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'Delete',
    (event) => {
      if (isTypingTarget(event.target)) return
      if (visibleSelectedIds.length === 0) return

      event.preventDefault()
      void onDeleteSelected()
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  return (
    <ResizableSidebarLayout
      panelId="comments"
      sidebarDefaultSize={24}
      sidebarMinSize={18}
      sidebarMaxSize={38}
      sidebar={
        <CommentsSidebarFilters
          searchInputRef={searchInputRef}
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
          contextFilter={contextFilter}
          onContextFilterChange={onContextFilterChange}
          selectedPair={selectedPair}
          onSelectedPairChange={onSelectedPairChange}
          reviewPairs={reviewPairs}
          selectedFilePath={effectiveSelectedFilePath}
          onSelectedFilePathChange={onSelectedFilePathChange}
          fileFilters={fileFilters}
          matchingCommentsCount={searchedComments.length}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={onClearFilters}
        />
      }
      content={
        <section className="flex h-full min-h-0 flex-col">
          <header className="border-border bg-surface border-b px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">COMMENTS</div>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {summaryLabel(repoComments.length, 'total', 'total')}
              </Badge>
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {summaryLabel(visibleComments.length, 'visible', 'visible')}
              </Badge>
              {visibleSelectedIds.length > 0 ? (
                <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                  {summaryLabel(visibleSelectedIds.length, 'selected', 'selected')}
                </Badge>
              ) : null}
            </div>

            <div className="text-muted-foreground mt-1 truncate text-xs">
              {activeRepo ? repoLabel(activeRepo) : 'All repositories'}
            </div>
          </header>

          <div className="border-border bg-surface-toolbar flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <Button size="xs" variant="outline" onClick={onToggleAllVisible} disabled={visibleComments.length === 0}>
              {allVisibleSelected ? 'Unselect Visible' : 'Select Visible'}
            </Button>

            <Button size="xs" variant="outline" onClick={() => void onDeleteVisible()} disabled={visibleComments.length === 0}>
              Delete Visible ({visibleComments.length})
            </Button>

            <Button size="xs" variant="outline" onClick={onCopyVisible} disabled={visibleComments.length === 0}>
              Copy Visible ({visibleComments.length})
            </Button>

            <span className="text-muted-foreground ml-auto text-[11px]">
              / search · J/K focus · X select · Enter open · Mod+C copy
            </span>
          </div>

          {visibleSelectedIds.length > 0 ? (
            <div className="border-border bg-accent/20 flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-medium">
                {summaryLabel(visibleSelectedIds.length, 'comment', 'comments')} selected
              </span>

              <Button size="xs" variant="destructive" onClick={() => void onDeleteSelected()}>
                Delete Selected
              </Button>

              <Button size="xs" variant="outline" onClick={onCopySelected}>
                Copy Selected
              </Button>

              <Button size="xs" variant="ghost" onClick={onClearSelection}>
                Clear Selection
              </Button>
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            {visibleComments.length === 0 ? (
              <CommentsEmptyState
                hasComments={repoComments.length > 0}
                hasActiveFilters={hasActiveFilters}
                onClearFilters={onClearFilters}
              />
            ) : (
              <CommentGroupList
                groups={groupedComments}
                selectedIdSet={selectedIdSet}
                focusedCommentId={effectiveFocusedCommentId}
                onToggleSelected={onToggleSelected}
                onFocusComment={setFocusedCommentId}
                onOpenComment={onOpenComment}
                onCopyComment={onCopyComment}
                onDeleteComment={onDeleteComment}
              />
            )}
          </div>
        </section>
      }
    />
  )
}
