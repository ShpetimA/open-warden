import { skipToken } from '@reduxjs/toolkit/query'
import { ArrowRightLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useOutletContext } from 'react-router'

import type { AppShellOutletContext } from '@/app/AppShell'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createCommentCountByPathForRepo } from '@/features/comments/selectors'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { DiffWorkspaceHeader } from '@/features/diff-view/components/DiffWorkspaceHeader'
import {
  useGetBranchFilesQuery,
  useGetBranchFileVersionsQuery,
  useGetGitSnapshotQuery,
  useGetLocalBranchesQuery,
} from '@/features/source-control/api'
import {
  clearReviewSelection,
  setReviewActivePath,
  setReviewBaseRef,
  setReviewHeadRef,
} from '@/features/source-control/sourceControlSlice'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'
import { statusBadge } from '@/features/source-control/utils'

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

export function ReviewScreen() {
  const dispatch = useAppDispatch()
  const { sidebarOpen, onToggleSidebar } = useOutletContext<AppShellOutletContext>()
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
  const branchList = branches ?? []
  const readyForDiff = Boolean(activeRepo && reviewBaseRef && reviewHeadRef)

  const branchFilesQuery = useGetBranchFilesQuery(
    readyForDiff ? { repoPath: activeRepo, baseRef: reviewBaseRef, headRef: reviewHeadRef } : skipToken,
  )
  const branchFiles = branchFilesQuery.data ?? []

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
  const showDiffActions = Boolean(reviewActivePath && (oldFile || newFile))
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
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '300px 1fr' }}>
      <aside className="border-border bg-surface flex min-h-0 flex-col overflow-hidden border-r">
        <div className="border-border border-b p-2">
          <div className="text-foreground/80 mb-2 text-[11px] font-semibold tracking-[0.14em]">
            BRANCH REVIEW
          </div>
          <div className="space-y-2">
            <Select
              value={reviewBaseRef}
              onValueChange={(value) => {
                dispatch(setReviewBaseRef(value))
                dispatch(setReviewActivePath(''))
              }}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Base branch" />
              </SelectTrigger>
              <SelectContent>
                {branchList.map((branch) => (
                  <SelectItem key={`base-${branch}`} value={branch}>
                    {branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
              <Select
                value={reviewHeadRef}
                onValueChange={(value) => {
                  dispatch(setReviewHeadRef(value))
                  dispatch(setReviewActivePath(''))
                }}
              >
                <SelectTrigger className="h-7 flex-1 text-xs">
                  <SelectValue placeholder="Compare branch" />
                </SelectTrigger>
                <SelectContent>
                  {branchList.map((branch) => (
                    <SelectItem key={`head-${branch}`} value={branch}>
                      {branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
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
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {!reviewBaseRef || !reviewHeadRef ? (
            <div className="text-muted-foreground p-3 text-xs">Select both branches to start review.</div>
          ) : branchFiles.length === 0 ? (
            <div className="text-muted-foreground p-3 text-xs">No changed files in this comparison.</div>
          ) : (
            branchFiles.map((file) => {
              const isActive = file.path === reviewActivePath
              const commentCount = reviewCommentCounts.get(file.path) ?? 0
              const normalizedPath = file.path.replace(/\\/g, '/')
              const parts = normalizedPath.split('/').filter(Boolean)
              const fileName = parts[parts.length - 1] ?? file.path
              const directoryPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

              return (
                <button
                  key={file.path}
                  type="button"
                  className={`border-input flex w-full min-w-0 items-center gap-2 border-b px-2 py-1 text-left text-xs ${
                    isActive ? 'bg-surface-active' : 'hover:bg-accent/60'
                  }`}
                  onClick={() => {
                    dispatch(setReviewActivePath(file.path))
                  }}
                  title={file.path}
                >
                  <span className="text-warning w-3 text-center text-[10px]">{statusBadge(file.status)}</span>
                  <span className="text-foreground shrink-0 font-medium">{fileName}</span>
                  {commentCount > 0 ? (
                    <span className="border-input bg-surface-alt text-foreground inline-flex h-4 min-w-4 items-center justify-center border px-1 text-[10px]">
                      {commentCount}
                    </span>
                  ) : null}
                  {directoryPath ? (
                    <span className="text-muted-foreground min-w-0 flex-1 truncate">{` ${directoryPath}`}</span>
                  ) : null}
                </button>
              )
            })
          )}
        </div>
      </aside>

      <section className="flex h-full min-h-0 flex-col">
        <DiffWorkspaceHeader
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          activePath={reviewActivePath}
          commentContext={context}
          canComment
          showDiffActions={showDiffActions}
        />

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
    </div>
  )
}
