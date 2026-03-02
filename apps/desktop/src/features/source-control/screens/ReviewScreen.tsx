import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowRightLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ResizableSidebarLayout } from '@/components/layout/ResizableSidebarLayout'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCommentCountByPathForRepo } from '@/features/comments/selectors'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
  useGetGitSnapshotQuery,
  useGetLocalBranchesQuery,
} from '@/features/source-control/api'
import { useReviewKeyboardNav } from '@/features/source-control/hooks/useReviewKeyboardNav'
import {
  clearReviewSelection,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
} from '@/features/source-control/sourceControlSlice'
import { FileListRow } from '@/features/source-control/components/FileListRow'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'
import type { FileItem } from '@/features/source-control/types'

function firstAvailableBranch(branches: string[]): string {
  return branches[0] ?? ''
}

function preferredBaseBranch(branches: string[]): string {
  if (branches.includes('main')) return 'main'
  if (branches.includes('master')) return 'master'
  return firstAvailableBranch(branches)
}

function firstDifferentBranch(branches: string[], current: string): string {
  const found = branches.find((branch) => branch !== current)
  return found ?? current
}

const EMPTY_BRANCHES: string[] = []
const EMPTY_BRANCH_FILES: FileItem[] = []

type BranchSelectFieldProps = {
  label: string
  value: string
  placeholder: string
  options: string[]
  onChange: (value: string) => void
}

function BranchSelectField({ label, value, placeholder, options, onChange }: BranchSelectFieldProps) {
  return (
    <div className="min-w-0">
      <div className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-[0.12em] uppercase">
        {label}
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 w-full text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((branch) => (
            <SelectItem key={`${label}-${branch}`} value={branch}>
              {branch}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function ReviewScreen() {
  useReviewKeyboardNav()

  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef)
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef)
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath)
  const comments = useAppSelector((state) => state.comments)
  const reviewCommentCounts = createCommentCountByPathForRepo(comments, activeRepo, {
    kind: 'review',
    baseRef: reviewBaseRef,
    headRef: reviewHeadRef,
  })

  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })
  const { data: branches } = useGetLocalBranchesQuery(activeRepo, { skip: !activeRepo })
  const branchList = branches ?? EMPTY_BRANCHES
  const readyForDiff = Boolean(activeRepo && reviewBaseRef && reviewHeadRef)

  const branchFilesQuery = useGetBranchFilesQuery(
    readyForDiff ? { repoPath: activeRepo, baseRef: reviewBaseRef, headRef: reviewHeadRef } : skipToken,
  )
  const branchFiles = branchFilesQuery.data ?? EMPTY_BRANCH_FILES

  const selectedReviewFile = branchFiles.find((file) => file.path === reviewActivePath)
  const branchFileVersionsQuery = useGetBranchFileVersionsQuery(
    readyForDiff && reviewActivePath
      ? {
          repoPath: activeRepo,
          baseRef: reviewBaseRef,
          headRef: reviewHeadRef,
          relPath: reviewActivePath,
          previousPath: selectedReviewFile?.previousPath ?? undefined,
        }
      : skipToken,
  )

  const reviewVersions = branchFileVersionsQuery.data
  const oldFile = reviewVersions?.oldFile ?? null
  const newFile = reviewVersions?.newFile ?? null
  const loadingPatch = branchFileVersionsQuery.isFetching
  const errorMessage = errorMessageFrom(branchFileVersionsQuery.error, '')

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearReviewSelection())
      return
    }
    if (branchList.length === 0) {
      if (reviewBaseRef) dispatch(setReviewBaseRef(''))
      if (reviewHeadRef) dispatch(setReviewHeadRef(''))
      dispatch(clearReviewSelection())
      return
    }

    const hasBase = branchList.includes(reviewBaseRef)
    const hasHead = branchList.includes(reviewHeadRef)

    const nextBase = hasBase ? reviewBaseRef : preferredBaseBranch(branchList)
    if (nextBase !== reviewBaseRef) {
      dispatch(setReviewBaseRef(nextBase))
    }

    const preferredHead = snapshot?.branch && branchList.includes(snapshot.branch) ? snapshot.branch : ''
    const nextHead = hasHead ? reviewHeadRef : preferredHead || firstDifferentBranch(branchList, nextBase)
    if (nextHead !== reviewHeadRef) {
      dispatch(setReviewHeadRef(nextHead))
    }
  }, [
    activeRepo,
    branchList,
    dispatch,
    reviewBaseRef,
    reviewHeadRef,
    snapshot?.branch,
  ])

  useEffect(() => {
    if (!readyForDiff) {
      if (reviewActivePath) dispatch(setReviewActivePath(''))
      return
    }
    if (!branchFilesQuery.data) return
    if (branchFiles.length === 0) {
      if (reviewActivePath) dispatch(setReviewActivePath(''))
      return
    }
    const existing = branchFiles.find((file) => file.path === reviewActivePath)
    if (!existing) {
      dispatch(setReviewActivePath(branchFiles[0].path))
    }
  }, [
    branchFiles,
    branchFilesQuery.data,
    dispatch,
    readyForDiff,
    reviewActivePath,
  ])

  const context = { kind: 'review' as const, baseRef: reviewBaseRef, headRef: reviewHeadRef }

  return (
    <ResizableSidebarLayout
      sidebarDefaultSize={24}
      sidebarMinSize={16}
      sidebarMaxSize={40}
      sidebar={
        <aside className="bg-surface-toolbar border-border/70 flex h-full min-h-0 flex-col overflow-hidden border-r">
          <div className="border-border border-b p-2.5">
            <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
              BRANCH REVIEW
            </div>
            <div className="border-input bg-surface mt-2 rounded-md border p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-1.5">
                <BranchSelectField
                  label="Base"
                  value={reviewBaseRef}
                  placeholder="Base branch"
                  options={branchList}
                  onChange={(value) => {
                    dispatch(setReviewBaseRef(value))
                    dispatch(setReviewActivePath(''))
                  }}
                />

                <Button
                  size="icon-xs"
                  variant="outline"
                  className="mb-0.5"
                  onClick={() => {
                    const nextBase = reviewHeadRef
                    const nextHead = reviewBaseRef
                    dispatch(setReviewBaseRef(nextBase))
                    dispatch(setReviewHeadRef(nextHead))
                    dispatch(setReviewActivePath(''))
                  }}
                  disabled={!reviewBaseRef || !reviewHeadRef}
                  title="Swap branches"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </Button>

                <BranchSelectField
                  label="Compare"
                  value={reviewHeadRef}
                  placeholder="Compare branch"
                  options={branchList}
                  onChange={(value) => {
                    dispatch(setReviewHeadRef(value))
                    dispatch(setReviewActivePath(''))
                  }}
                />
              </div>
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 overflow-hidden">
            {!reviewBaseRef || !reviewHeadRef ? (
              <div className="text-muted-foreground p-3 text-xs">Select both branches to start review.</div>
            ) : branchFiles.length === 0 ? (
              <div className="text-muted-foreground p-3 text-xs">No changed files in this comparison.</div>
            ) : (
              branchFiles.map((file) => {
                const isActive = file.path === reviewActivePath
                const commentCount = reviewCommentCounts.get(file.path) ?? 0
                return (
                  <FileListRow
                    key={file.path}
                    path={file.path}
                    status={file.status}
                    commentCount={commentCount}
                    isActive={isActive}
                    onSelect={() => {
                      dispatch(setReviewActivePath(file.path))
                    }}
                  />
                )
              })
            )}
          </ScrollArea>
        </aside>
      }
      content={
        <section className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          {errorMessage ? (
            <div className="text-destructive p-3 text-sm">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
          ) : !reviewActivePath ? (
            <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
          ) : (
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={reviewActivePath}
              commentContext={context}
              canComment
            />
          )}
        </div>
        </section>
      }
    />
  )
}
