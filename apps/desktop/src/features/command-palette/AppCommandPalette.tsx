import { skipToken } from '@reduxjs/toolkit/query'
import { useHotkey } from '@tanstack/react-hotkeys'
import { Clock3, File, GitCommitHorizontal, Wrench } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'

import { FEATURE_NAV_ITEMS, featureKeyFromPath } from '@/app/featureNavigation'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import { confirmDiscard, copyComments } from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import {
  closeRepo,
  commitAction,
  discardChangesGroupAction,
  refreshActiveRepo,
  selectFile,
  selectFolder,
  selectHistoryCommit,
  selectHistoryFile,
  selectRepo,
  setDiffStyleValue,
  stageAllAction,
  stageFileAction,
  unstageAllAction,
} from '@/features/source-control/actions'
import {
  useGetBranchFilesQuery,
  useGetCommitFilesQuery,
  useGetCommitHistoryQuery,
  useGetGitSnapshotQuery,
} from '@/features/source-control/api'
import { setReviewActivePath } from '@/features/source-control/sourceControlSlice'
import type {
  BucketedFile,
  CommentContext,
  CommentItem,
  SelectedFile,
} from '@/features/source-control/types'

import {
  buildCommandActionItems,
  buildCommandCommitItems,
  buildCommandFileItems,
} from './buildCommandItems'
import type { CommandActionItem, CommandCommitItem, CommandFileItem } from './commandPaletteTypes'

type AppCommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function isMatchingContext(comment: CommentItem, context: CommentContext): boolean {
  const kind = comment.contextKind ?? 'changes'
  if (kind !== context.kind) return false

  if (context.kind === 'review') {
    return comment.baseRef === context.baseRef && comment.headRef === context.headRef
  }

  return true
}

function flattenSnapshot(snapshot: {
  staged: BucketedFile[]
  unstaged: BucketedFile[]
  untracked: BucketedFile[]
}): BucketedFile[] {
  return [...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked]
}

function uniqueSelection(files: SelectedFile[]): SelectedFile[] {
  const seen = new Set<string>()
  const result: SelectedFile[] = []
  for (const file of files) {
    const key = `${file.bucket}\u0000${file.path}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(file)
  }
  return result
}

function selectedOrFocusedFiles(
  selectedFiles: SelectedFile[],
  activeBucket: SelectedFile['bucket'],
  activePath: string,
): SelectedFile[] {
  if (selectedFiles.length > 0) return uniqueSelection(selectedFiles)
  if (!activePath) return []
  return [{ bucket: activeBucket, path: activePath }]
}

function commandItemSubtitle(item: CommandActionItem | CommandFileItem | CommandCommitItem) {
  return item.subtitle ?? ''
}

function commandItemSearchValue(item: CommandActionItem | CommandFileItem | CommandCommitItem) {
  return `${item.label} ${item.searchText}`
}

async function runCommandItem(
  item: CommandActionItem | CommandFileItem | CommandCommitItem,
  onOpenChange: (open: boolean) => void,
) {
  try {
    await item.onSelect()
    onOpenChange(false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toast.error(message)
  }
}

export function AppCommandPalette({ open, onOpenChange }: AppCommandPaletteProps) {
  useHotkey(
    'Mod+K',
    (event) => {
      event.preventDefault()
      onOpenChange(!open)
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  )

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      className="command-palette-modal max-w-[920px] overflow-hidden border p-0 shadow-2xl"
      title="Quick Open"
      description="Search files, commands, or commits"
      showCloseButton={false}
    >
      {open ? <AppCommandPaletteContent onOpenChange={onOpenChange} /> : null}
    </CommandDialog>
  )
}

type AppCommandPaletteContentProps = {
  onOpenChange: (open: boolean) => void
}

function AppCommandPaletteContent({ onOpenChange }: AppCommandPaletteContentProps) {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { setTheme } = useTheme()
  const feature = featureKeyFromPath(location.pathname)

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const repos = useAppSelector((state) => state.sourceControl.repos)
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const selectedFiles = useAppSelector((state) => state.sourceControl.selectedFiles)
  const commitMessage = useAppSelector((state) => state.sourceControl.commitMessage)
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const reviewBaseRef = useAppSelector((state) => state.sourceControl.reviewBaseRef)
  const reviewHeadRef = useAppSelector((state) => state.sourceControl.reviewHeadRef)
  const reviewActivePath = useAppSelector((state) => state.sourceControl.reviewActivePath)
  const comments = useAppSelector((state) => state.comments)

  const { snapshot } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    selectFromResult: ({ data }) => ({
      snapshot: data
        ? {
            staged: data.staged.map((file) => ({ ...file, bucket: 'staged' as const })),
            unstaged: data.unstaged.map((file) => ({ ...file, bucket: 'unstaged' as const })),
            untracked: data.untracked.map((file) => ({ ...file, bucket: 'untracked' as const })),
          }
        : null,
    }),
  })

  const { commits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo, limit: 200 } : skipToken,
    {
      selectFromResult: ({ data }) => ({ commits: data ?? [] }),
    },
  )

  const { historyFiles } = useGetCommitFilesQuery(
    feature === 'history' && activeRepo && historyCommitId
      ? { repoPath: activeRepo, commitId: historyCommitId }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({ historyFiles: data ?? [] }),
    },
  )

  const reviewReady = Boolean(activeRepo && reviewBaseRef && reviewHeadRef)
  const { reviewFiles } = useGetBranchFilesQuery(
    feature === 'review' && reviewReady
      ? {
          repoPath: activeRepo,
          baseRef: reviewBaseRef,
          headRef: reviewHeadRef,
        }
      : skipToken,
    {
      selectFromResult: ({ data }) => ({ reviewFiles: data ?? [] }),
    },
  )

  const snapshotRows = snapshot ? flattenSnapshot(snapshot) : []
  const selectionTargets =
    feature === 'changes' ? selectedOrFocusedFiles(selectedFiles, activeBucket, activePath) : []
  const stageTargets = selectionTargets.filter((file) => file.bucket !== 'staged')
  const discardTargets = selectionTargets
    .map((selected) =>
      snapshotRows.find((row) => row.bucket === selected.bucket && row.path === selected.path),
    )
    .filter((row): row is BucketedFile => !!row)

  const stagedCount = snapshot?.staged.length ?? 0
  const hasRunningAction = runningAction !== ''

  const commentContext: CommentContext | null =
    feature === 'review'
      ? reviewBaseRef && reviewHeadRef
        ? { kind: 'review', baseRef: reviewBaseRef, headRef: reviewHeadRef }
        : null
      : { kind: 'changes' }

  const contextPath = feature === 'review' ? reviewActivePath : activePath
  const allComments = compactComments(comments)
  const repoComments = activeRepo
    ? allComments.filter((comment) => comment.repoPath === activeRepo)
    : []
  const contextComments = commentContext
    ? repoComments.filter((comment) => isMatchingContext(comment, commentContext))
    : []
  const fileContextComments = contextPath
    ? contextComments.filter((comment) => comment.filePath === contextPath)
    : []

  const actionItems = buildCommandActionItems([
    ...FEATURE_NAV_ITEMS.map((item) => ({
      id: `nav:${item.key}`,
      label: `Go to ${item.label}`,
      subtitle: item.path,
      keywords: [item.key, item.label, item.path],
      onSelect: () => {
        navigate(item.path)
      },
    })),
    {
      id: 'repo:add',
      label: 'Add Repository',
      shortcut: '⌘O',
      keywords: ['repo', 'folder', 'open'],
      onSelect: async () => {
        await dispatch(selectFolder())
      },
    },
    ...repos.map((repoPath) => ({
      id: `repo:switch:${repoPath}`,
      label: `Switch Repo: ${repoPath.split('/').filter(Boolean).pop() ?? repoPath}`,
      subtitle: repoPath,
      keywords: ['repo', 'switch'],
      disabled: repoPath === activeRepo,
      onSelect: async () => {
        await dispatch(selectRepo(repoPath))
      },
    })),
    {
      id: 'repo:close-active',
      label: 'Close Active Repo',
      disabled: !activeRepo,
      keywords: ['repo', 'close'],
      onSelect: async () => {
        if (!activeRepo) return
        await dispatch(closeRepo(activeRepo))
      },
    },
    {
      id: 'repo:refresh',
      label: 'Refresh Active Repo',
      disabled: !activeRepo || hasRunningAction,
      keywords: ['repo', 'refresh', 'snapshot'],
      onSelect: async () => {
        await dispatch(refreshActiveRepo())
      },
    },
    {
      id: 'changes:stage-selection',
      label: 'Stage Selected / Focused Files',
      disabled: !activeRepo || hasRunningAction || stageTargets.length === 0,
      keywords: ['stage', 'selection'],
      onSelect: async () => {
        for (const file of stageTargets) {
          await dispatch(stageFileAction(file.path))
        }
      },
    },
    {
      id: 'changes:stage-all',
      label: 'Stage All Changes',
      disabled: !activeRepo || hasRunningAction || snapshotRows.length === 0,
      keywords: ['stage', 'all'],
      onSelect: async () => {
        await dispatch(stageAllAction())
      },
    },
    {
      id: 'changes:unstage-all',
      label: 'Unstage All Changes',
      disabled: !activeRepo || hasRunningAction || stagedCount === 0,
      keywords: ['unstage', 'all'],
      onSelect: async () => {
        await dispatch(unstageAllAction())
      },
    },
    {
      id: 'changes:discard-selection',
      label: 'Discard Selected / Focused Changes',
      disabled: !activeRepo || hasRunningAction || discardTargets.length === 0,
      keywords: ['discard', 'revert', 'selection'],
      onSelect: async () => {
        if (discardTargets.length === 0) return
        const confirmed = await confirmDiscard(
          `Discard changes for ${discardTargets.length} file${discardTargets.length === 1 ? '' : 's'}?`,
        )
        if (!confirmed) return
        await dispatch(discardChangesGroupAction(discardTargets))
      },
    },
    {
      id: 'changes:commit',
      label: 'Commit Staged Changes',
      subtitle: commitMessage.trim()
        ? `Message: ${commitMessage.trim()}`
        : 'Commit message is empty',
      disabled: !activeRepo || hasRunningAction || stagedCount === 0 || !commitMessage.trim(),
      keywords: ['commit', 'staged'],
      onSelect: async () => {
        await dispatch(commitAction())
      },
    },
    {
      id: 'diff:split',
      label: 'Switch Diff to Split',
      disabled: diffStyle === 'split',
      keywords: ['diff', 'split'],
      onSelect: async () => {
        await dispatch(setDiffStyleValue('split'))
      },
    },
    {
      id: 'diff:unified',
      label: 'Switch Diff to Unified',
      disabled: diffStyle === 'unified',
      keywords: ['diff', 'unified'],
      onSelect: async () => {
        await dispatch(setDiffStyleValue('unified'))
      },
    },
    {
      id: 'comments:copy-file',
      label: 'Copy Comments (File)',
      disabled: !activeRepo || !commentContext || !contextPath || fileContextComments.length === 0,
      keywords: ['comments', 'copy', 'file'],
      onSelect: async () => {
        if (!commentContext || !contextPath) return
        const copied = await dispatch(
          copyComments('file', {
            context: commentContext,
            activePath: contextPath,
          }),
        )
        if (copied) toast.success('Copied file comments')
      },
    },
    {
      id: 'comments:copy-all',
      label: 'Copy Comments (All)',
      disabled: !activeRepo || !commentContext || contextComments.length === 0,
      keywords: ['comments', 'copy', 'all'],
      onSelect: async () => {
        if (!commentContext) return
        const copied = await dispatch(copyComments('all', { context: commentContext }))
        if (copied) toast.success('Copied comments')
      },
    },
    {
      id: 'theme:system',
      label: 'Set Theme: System',
      keywords: ['theme', 'system'],
      onSelect: () => {
        setTheme('system')
      },
    },
    {
      id: 'theme:light',
      label: 'Set Theme: Light',
      keywords: ['theme', 'light'],
      onSelect: () => {
        setTheme('light')
      },
    },
    {
      id: 'theme:dark',
      label: 'Set Theme: Dark',
      keywords: ['theme', 'dark'],
      onSelect: () => {
        setTheme('dark')
      },
    },
  ])

  const fileItems = buildCommandFileItems(
    feature === 'changes'
      ? snapshotRows.map((file) => ({
          path: file.path,
          status: file.status,
          bucket: file.bucket,
          secondaryLabel: file.bucket,
          keywords: [file.bucket, file.status],
          onSelect: async () => {
            navigate('/changes')
            await dispatch(selectFile(file.bucket, file.path))
          },
        }))
      : feature === 'history'
        ? historyFiles.map((file) => ({
            path: file.path,
            status: file.status,
            secondaryLabel:
              file.previousPath && file.previousPath !== file.path
                ? `from ${file.previousPath}`
                : 'history',
            keywords: ['history', file.status],
            onSelect: async () => {
              navigate('/history')
              await dispatch(selectHistoryFile(file.path))
            },
          }))
        : feature === 'review'
          ? reviewFiles.map((file) => ({
              path: file.path,
              status: file.status,
              secondaryLabel:
                file.previousPath && file.previousPath !== file.path
                  ? `from ${file.previousPath}`
                  : 'review',
              keywords: ['review', file.status],
              onSelect: () => {
                navigate('/review')
                dispatch(setReviewActivePath(file.path))
              },
            }))
          : [],
  )

  const historyItems = buildCommandCommitItems(
    commits.map((commit) => ({
      commitId: commit.commitId,
      shortId: commit.shortId,
      summary: commit.summary,
      author: commit.author,
      relativeTime: commit.relativeTime,
      keywords: ['history', 'commit'],
      onSelect: async () => {
        navigate('/history')
        await dispatch(selectHistoryCommit(commit.commitId))
      },
    })),
  )

  return (
    <>
      <CommandInput placeholder="Search files, commands, or commits..." />
      <CommandList className="max-h-[65vh]">
        <CommandEmpty>No matching commands.</CommandEmpty>

        {actionItems.length > 0 ? (
          <CommandGroup heading="ACTIONS">
            {actionItems.map((item) => (
              <CommandItem
                key={item.id}
                value={commandItemSearchValue(item)}
                disabled={item.disabled}
                onSelect={() => {
                  void runCommandItem(item, onOpenChange)
                }}
              >
                <Wrench className="h-4 w-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.subtitle ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {commandItemSubtitle(item)}
                    </span>
                  ) : null}
                </div>
                {item.shortcut ? <CommandShortcut>{item.shortcut}</CommandShortcut> : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {fileItems.length > 0 ? <CommandSeparator /> : null}
        {fileItems.length > 0 ? (
          <CommandGroup heading="FILES">
            {fileItems.map((item) => (
              <CommandItem
                key={item.id}
                value={commandItemSearchValue(item)}
                disabled={item.disabled}
                onSelect={() => {
                  void runCommandItem(item, onOpenChange)
                }}
              >
                <File className="h-4 w-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {commandItemSubtitle(item)}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {historyItems.length > 0 ? <CommandSeparator /> : null}
        {historyItems.length > 0 ? (
          <CommandGroup heading="HISTORY">
            {historyItems.map((item) => (
              <CommandItem
                key={item.id}
                value={commandItemSearchValue(item)}
                disabled={item.disabled}
                onSelect={() => {
                  void runCommandItem(item, onOpenChange)
                }}
              >
                <Clock3 className="h-4 w-4" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {commandItemSubtitle(item)}
                  </span>
                </div>
                <CommandShortcut>
                  <GitCommitHorizontal className="h-3 w-3" />
                  {item.shortId}
                </CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
      <div className="border-border text-muted-foreground bg-surface-toolbar flex items-center justify-between border-t px-3 py-2 text-xs">
        <span>Select</span>
        <span className="border-input rounded border px-1 py-0 text-[10px]">ESC</span>
      </div>
    </>
  )
}
