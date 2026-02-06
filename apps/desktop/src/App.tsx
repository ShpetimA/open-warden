import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { observable } from '@legendapp/state'
import { useSelector } from '@legendapp/state/react'
import { parsePatchFiles } from '@pierre/diffs'
import { FileDiff, type FileDiffMetadata } from '@pierre/diffs/react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  GitCommitHorizontal,
  GitPullRequestArrow,
  Minus,
  PanelLeft,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

type Bucket = 'unstaged' | 'staged' | 'untracked'
type DiffStyle = 'split' | 'unified'

type FileItem = {
  path: string
  status: string
}

type SelectionRange = {
  start: number
  end: number
  side?: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
}

type CommentItem = {
  id: string
  repoPath: string
  filePath: string
  bucket: Bucket
  startLine: number
  endLine: number
  side: 'deletions' | 'additions'
  endSide?: 'deletions' | 'additions'
  text: string
}

type GitSnapshot = {
  repoRoot: string
  branch: string
  unstaged: FileItem[]
  staged: FileItem[]
  untracked: FileItem[]
}

const state$ = observable({
  repos: [] as string[],
  activeRepo: '',
  snapshot: null as GitSnapshot | null,
  activeBucket: 'unstaged' as Bucket,
  activePath: '',
  patch: '',
  diffStyle: 'split' as DiffStyle,
  selectedRange: null as SelectionRange | null,
  draftComment: '',
  comments: [] as CommentItem[],
  commitMessage: '',
  loadingSnapshot: false,
  loadingPatch: false,
  runningAction: '' as '' | 'stage-all' | 'unstage-all' | 'discard-changes' | 'commit' | `file:${string}`,
  error: '',
})

function repoLabel(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

function findExistingBucket(snapshot: GitSnapshot, path: string): Bucket | null {
  if (snapshot.unstaged.some((x) => x.path === path)) return 'unstaged'
  if (snapshot.staged.some((x) => x.path === path)) return 'staged'
  if (snapshot.untracked.some((x) => x.path === path)) return 'untracked'
  return null
}

function normalizeRange(range: SelectionRange): { start: number; end: number } {
  return {
    start: Math.min(range.start, range.end),
    end: Math.max(range.start, range.end),
  }
}

function formatRange(startLine: number, endLine: number): string {
  return startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`
}

function statusBadge(status: string): string {
  if (status === 'added' || status === 'untracked') return 'A'
  if (status === 'deleted') return 'D'
  if (status === 'renamed') return 'R'
  if (status === 'copied') return 'C'
  if (status === 'type-changed') return 'T'
  if (status === 'unmerged') return 'U'
  return 'M'
}

function parseSelectionRange(value: unknown): SelectionRange | null {
  if (!value || typeof value !== 'object') return null

  const maybe = value as Partial<SelectionRange>
  if (typeof maybe.start !== 'number' || typeof maybe.end !== 'number') return null

  return {
    start: maybe.start,
    end: maybe.end,
    side: maybe.side === 'deletions' ? 'deletions' : 'additions',
    endSide: maybe.endSide === 'deletions' ? 'deletions' : 'additions',
  }
}

function areRangesEqual(a: SelectionRange | null, b: SelectionRange | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return a.start === b.start && a.end === b.end && a.side === b.side && a.endSide === b.endSide
}

function hashString(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function buildDiffCacheKey(repoPath: string, bucket: Bucket, relPath: string, patch: string): string {
  return `${repoPath}:${bucket}:${relPath}:${patch.length}:${hashString(patch)}`
}

function parseSingleFileDiff(patch: string, cacheKeyPrefix: string): FileDiffMetadata | null {
  try {
    const parsedPatches = parsePatchFiles(patch, cacheKeyPrefix)
    if (parsedPatches.length !== 1) return null
    const files = parsedPatches[0]?.files
    if (!files || files.length !== 1) return null
    return files[0] ?? null
  } catch {
    return null
  }
}

async function loadSnapshot(repoPath: string) {
  state$.loadingSnapshot.set(true)
  state$.error.set('')

  try {
    const snapshot = await invoke<GitSnapshot>('get_git_snapshot', { repoPath })
    state$.snapshot.set(snapshot)

    const previousPath = state$.activePath.get()
    const existingBucket = previousPath ? findExistingBucket(snapshot, previousPath) : null

    if (existingBucket && previousPath) {
      state$.activeBucket.set(existingBucket)
      await loadPatch(repoPath, existingBucket, previousPath)
      return
    }

    state$.activePath.set('')
    state$.patch.set('')
    state$.selectedRange.set(null)
  } catch (error) {
    state$.snapshot.set(null)
    state$.activePath.set('')
    state$.patch.set('')
    state$.selectedRange.set(null)
    state$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    state$.loadingSnapshot.set(false)
  }
}

async function loadPatch(repoPath: string, bucket: Bucket, relPath: string) {
  state$.loadingPatch.set(true)
  state$.error.set('')

  try {
    const patch = await invoke<string>('get_file_patch', { repoPath, bucket, relPath })
    state$.activeBucket.set(bucket)
    state$.activePath.set(relPath)
    state$.patch.set(patch)
    state$.selectedRange.set(null)
  } catch (error) {
    state$.patch.set('')
    state$.error.set(error instanceof Error ? error.message : String(error))
  } finally {
    state$.loadingPatch.set(false)
  }
}

function App() {
  const repos = useSelector(state$.repos)
  const activeRepo = useSelector(state$.activeRepo)
  const snapshot = useSelector(state$.snapshot)
  const activeBucket = useSelector(state$.activeBucket)
  const activePath = useSelector(state$.activePath)
  const patch = useSelector(state$.patch)
  const diffStyle = useSelector(state$.diffStyle)
  const selectedRange = useSelector(state$.selectedRange)
  const draftComment = useSelector(state$.draftComment)
  const comments = useSelector(state$.comments)
  const commitMessage = useSelector(state$.commitMessage)
  const loadingSnapshot = useSelector(state$.loadingSnapshot)
  const loadingPatch = useSelector(state$.loadingPatch)
  const runningAction = useSelector(state$.runningAction)
  const error = useSelector(state$.error)
  const diffViewportRef = useRef<HTMLDivElement | null>(null)
  const composerInputRef = useRef<HTMLInputElement | null>(null)
  const composerScrollRafRef = useRef<number | null>(null)
  const [composerPos, setComposerPos] = useState<{ top: number; left: number; visible: boolean }>({
    top: 0,
    left: 0,
    visible: false,
  })
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [collapse, setCollapse] = useState<Record<Bucket, boolean>>({
    staged: false,
    unstaged: false,
    untracked: false,
  })

  const safeComments = useMemo(() => {
    return (comments as Array<CommentItem | undefined>).reduce<CommentItem[]>((acc, item) => {
      if (item) acc.push(item)
      return acc
    }, [])
  }, [comments])
  const currentFileComments = useMemo(() => {
    return safeComments.filter((c) => c.repoPath === activeRepo && c.filePath === activePath)
  }, [safeComments, activeRepo, activePath])
  const currentAnnotations = useMemo(() => {
    return currentFileComments.map((comment): { side: 'deletions' | 'additions'; lineNumber: number; metadata: CommentItem } => ({
      side: comment.endSide ?? comment.side,
      lineNumber: comment.endLine,
      metadata: comment,
    }))
  }, [currentFileComments])
  const currentFileDiff = useMemo(() => {
    if (!patch.trim() || !activeRepo || !activePath) return null
    const cacheKey = buildDiffCacheKey(activeRepo, activeBucket, activePath, patch)
    return parseSingleFileDiff(patch, cacheKey)
  }, [patch, activeRepo, activeBucket, activePath])

  const selectFolder = async () => {
    const selected = await open({ directory: true, multiple: false })
    if (typeof selected !== 'string') return

    const current = state$.repos.get()
    if (!current.includes(selected)) {
      state$.repos.set([...current, selected])
    }

    state$.activeRepo.set(selected)
    await loadSnapshot(selected)
  }

  const onSelectRepo = async (repo: string) => {
    if (repo === activeRepo) return
    state$.activeRepo.set(repo)
    await loadSnapshot(repo)
  }

  const onRefresh = async () => {
    if (!activeRepo) return
    await loadSnapshot(activeRepo)
  }

  const onSelectFile = async (bucket: Bucket, relPath: string) => {
    if (!activeRepo) return
    await loadPatch(activeRepo, bucket, relPath)
  }

  const updateComposerPosition = useCallback(() => {
    const viewport = diffViewportRef.current
    const range = state$.selectedRange.get()
    if (!viewport || !range) {
      setComposerPos((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      return
    }

    const diffContainer = viewport.querySelector('diffs-container')
    const shadowRoot = diffContainer instanceof HTMLElement ? diffContainer.shadowRoot : null
    const selectedRows = shadowRoot
      ? Array.from(shadowRoot.querySelectorAll<HTMLElement>('[data-selected-line]'))
      : Array.from(viewport.querySelectorAll<HTMLElement>('[data-selected-line]'))

    if (selectedRows.length === 0) {
      const nextTop = viewport.scrollTop + 32
      const nextLeft = 12
      setComposerPos((prev) => {
        if (prev.visible && prev.top === nextTop && prev.left === nextLeft) return prev
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
    const left = Math.max(8, Math.min(anchorRect.left - viewportRect.left + viewport.scrollLeft, viewport.clientWidth - 320))

    setComposerPos((prev) => {
      if (prev.visible && prev.top === top && prev.left === left) return prev
      return { top, left, visible: true }
    })
  }, [])

  const onDiffViewportScroll = useCallback(() => {
    if (!state$.selectedRange.get()) return
    if (composerScrollRafRef.current != null) return
    composerScrollRafRef.current = window.requestAnimationFrame(() => {
      composerScrollRafRef.current = null
      updateComposerPosition()
    })
  }, [updateComposerPosition])

  useEffect(() => {
    return () => {
      if (composerScrollRafRef.current != null) {
        window.cancelAnimationFrame(composerScrollRafRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!selectedRange) {
      setComposerPos((prev) => ({ ...prev, visible: false }))
      return
    }

    const id = window.requestAnimationFrame(() => {
      updateComposerPosition()
    })
    return () => window.cancelAnimationFrame(id)
  }, [selectedRange, updateComposerPosition])

  useEffect(() => {
    if (!composerPos.visible) return
    const id = window.requestAnimationFrame(() => {
      composerInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [composerPos.visible])

  const applySelectionRange = useCallback((range: unknown) => {
    const parsedRange = parseSelectionRange(range)
    const currentRange = state$.selectedRange.get()
    if (areRangesEqual(currentRange, parsedRange)) return
    state$.selectedRange.set(parsedRange)
  }, [])

  const onLineSelectionEnd = useCallback((range: unknown) => {
    applySelectionRange(range)
    window.requestAnimationFrame(() => {
      updateComposerPosition()
    })
  }, [applySelectionRange, updateComposerPosition])

  const renderCommentAnnotation = useCallback((annotation: { metadata?: CommentItem }) => {
    const data = annotation.metadata
    if (!data) return null
    return (
      <div className="bg-accent text-accent-foreground max-w-[28rem] rounded px-1.5 py-0.5 text-[10px]">
        {data.text}
      </div>
    )
  }, [])

  const diffOptions = useMemo(() => {
    return {
      diffStyle,
      themeType: 'dark' as const,
      disableLineNumbers: false,
      enableLineSelection: true,
      onLineSelected: applySelectionRange,
      onLineSelectionEnd,
    }
  }, [diffStyle, applySelectionRange, onLineSelectionEnd])

  const addComment = () => {
    const range = state$.selectedRange.get()
    const text = state$.draftComment.get().trim()
    const repoPath = state$.activeRepo.get()
    const filePath = state$.activePath.get()
    const bucket = state$.activeBucket.get()

    if (!range || !text || !repoPath || !filePath) return

    const normalized = normalizeRange(range)
    const side = range.side ?? 'additions'
    const endSide = range.endSide ?? side
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    state$.comments.set([
      ...(state$.comments.get() as Array<CommentItem | undefined>).reduce<CommentItem[]>((acc, item) => {
        if (item) acc.push(item)
        return acc
      }, []),
      {
        id,
        repoPath,
        filePath,
        bucket,
        startLine: normalized.start,
        endLine: normalized.end,
        side,
        endSide,
        text,
      },
    ])

    state$.draftComment.set('')
    state$.selectedRange.set(null)
  }

  const removeComment = (id: string) => {
    const filtered = (state$.comments.get() as Array<CommentItem | undefined>).reduce<CommentItem[]>((acc, item) => {
      if (item && item.id !== id) acc.push(item)
      return acc
    }, [])
    state$.comments.set(filtered)
  }

  const copyComments = async (scope: 'file' | 'all') => {
    const allComments = (state$.comments.get() as Array<CommentItem | undefined>).reduce<CommentItem[]>((acc, item) => {
      if (item) acc.push(item)
      return acc
    }, [])
    const source =
      scope === 'file'
        ? allComments.filter(
            (c) => c.repoPath === state$.activeRepo.get() && c.filePath === state$.activePath.get(),
          )
        : allComments

    if (source.length === 0) return

    const payload = source
      .map((c) => `@${c.filePath}#${formatRange(c.startLine, c.endLine)} - ${c.text}`)
      .join('\n')

    try {
      await navigator.clipboard.writeText(payload)
    } catch (error) {
      state$.error.set(error instanceof Error ? error.message : String(error))
    }
  }

  const runAction = async (
    action: '' | 'stage-all' | 'unstage-all' | 'discard-changes' | 'commit' | `file:${string}`,
    fn: () => Promise<void>,
  ) => {
    if (!activeRepo) return
    state$.runningAction.set(action)
    state$.error.set('')
    try {
      await fn()
      await loadSnapshot(activeRepo)
    } catch (actionError) {
      state$.error.set(actionError instanceof Error ? actionError.message : String(actionError))
    } finally {
      state$.runningAction.set('')
    }
  }

  const confirmDiscard = (message: string): boolean => {
    return window.confirm(message)
  }

  const onStageFile = async (filePath: string) => {
    await runAction(`file:stage:${filePath}`, async () => {
      await invoke('stage_file', { repoPath: activeRepo, relPath: filePath })
    })
  }

  const onUnstageFile = async (filePath: string) => {
    await runAction(`file:unstage:${filePath}`, async () => {
      await invoke('unstage_file', { repoPath: activeRepo, relPath: filePath })
    })
  }

  const onDiscardFile = async (bucket: Bucket, filePath: string) => {
    if (!confirmDiscard(`Discard changes for ${filePath}?`)) return
    await runAction(`file:discard:${filePath}`, async () => {
      await invoke('discard_file', { repoPath: activeRepo, relPath: filePath, bucket })
    })
  }

  const onStageAll = async () => {
    await runAction('stage-all', async () => {
      await invoke('stage_all', { repoPath: activeRepo })
    })
  }

  const onUnstageAll = async () => {
    await runAction('unstage-all', async () => {
      await invoke('unstage_all', { repoPath: activeRepo })
    })
  }

  const onDiscardChangesGroup = async (files: Array<FileItem & { bucket: Bucket }>) => {
    if (files.length === 0) return
    if (!confirmDiscard(`Discard all changes in CHANGES (${files.length} files)?`)) return
    await runAction('discard-changes', async () => {
      for (const file of files) {
        await invoke('discard_file', {
          repoPath: activeRepo,
          relPath: file.path,
          bucket: file.bucket,
        })
      }
    })
  }

  const onCommit = async () => {
    if (!commitMessage.trim()) return
    await runAction('commit', async () => {
      await invoke('commit_staged', { repoPath: activeRepo, message: commitMessage.trim() })
      state$.commitMessage.set('')
    })
  }

  const unstagedFiles = snapshot?.unstaged ?? []
  const stagedFiles = snapshot?.staged ?? []
  const untrackedFiles = snapshot?.untracked ?? []
  const changedFiles: Array<FileItem & { bucket: Bucket }> = [
    ...unstagedFiles.map((file) => ({ ...file, bucket: 'unstaged' as const })),
    ...untrackedFiles.map((file) => ({ ...file, bucket: 'untracked' as const })),
  ]
  const stagedRows: Array<FileItem & { bucket: Bucket }> = stagedFiles.map((file) => ({
    ...file,
    bucket: 'staged' as const,
  }))

  const renderSection = (
    sectionKey: 'staged' | 'unstaged',
    title: string,
    rows: Array<FileItem & { bucket: Bucket }>,
  ) => {
    const isCollapsed = collapse[sectionKey]
    const isChanges = sectionKey === 'unstaged'

    return (
      <div className="overflow-hidden rounded border border-[#34343a] bg-[#1a1b1f]">
        <div className="group flex items-center gap-2 px-2 py-1 text-xs tracking-wide text-[#d0d3da] hover:bg-[#24262c]">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            onClick={() => {
              setCollapse((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
              state$.activeBucket.set(sectionKey)
            }}
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="min-w-0 truncate font-medium">{title}</span>
            {isChanges ? (
              <>
                <span className="rounded bg-[#30323a] px-1.5 py-0 text-[10px]">M {unstagedFiles.length}</span>
                <span className="rounded bg-[#30323a] px-1.5 py-0 text-[10px]">A {untrackedFiles.length}</span>
              </>
            ) : null}
            <span className="ml-auto rounded bg-[#30323a] px-1.5 py-0 text-[10px]">{rows.length}</span>
          </button>

          <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
            {isChanges ? (
              <>
                <button
                  type="button"
                  className="rounded p-1 text-[#b6bbca] hover:bg-[#314838] hover:text-white"
                  title="Stage all"
                  disabled={rows.length === 0 || !!runningAction}
                  onClick={() => {
                    void onStageAll()
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-[#b6bbca] hover:bg-[#4b2f34] hover:text-white"
                  title="Discard changes"
                  disabled={rows.length === 0 || !!runningAction}
                  onClick={() => {
                    void onDiscardChangesGroup(rows)
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded p-1 text-[#b6bbca] hover:bg-[#384255] hover:text-white"
                title="Unstage all"
                disabled={rows.length === 0 || !!runningAction}
                onClick={() => {
                  void onUnstageAll()
                }}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {!isCollapsed ? (
          <div className="border-t border-[#30323a]">
            {rows.length > 0 ? (
              rows.map((file) => {
                const isActive = activeBucket === file.bucket && activePath === file.path
                const staging =
                  runningAction === `file:stage:${file.path}` ||
                  runningAction === `file:unstage:${file.path}`
                const discarding = runningAction === `file:discard:${file.path}`
                return (
                  <div
                    key={`${file.bucket}-${file.path}`}
                    className={`group flex min-w-0 items-center gap-2 overflow-hidden border-b border-[#2b2d34] px-2 py-1 text-xs last:border-b-0 ${
                      isActive ? 'bg-[#2b303b]' : 'hover:bg-[#23252b]'
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 overflow-hidden text-left"
                      onClick={() => {
                        void onSelectFile(file.bucket, file.path)
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="w-3 text-center text-[10px] text-[#e39a59]">{statusBadge(file.status)}</span>
                        <span className="block max-w-full min-w-0 truncate whitespace-nowrap text-[#e2e5ec]">{file.path}</span>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      {file.bucket === 'staged' ? (
                        <button
                          type="button"
                          className="rounded p-1 text-[#b6bbca] hover:bg-[#384255] hover:text-white"
                          onClick={() => {
                            void onUnstageFile(file.path)
                          }}
                          disabled={staging || discarding || !!runningAction}
                          title="Unstage"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="rounded p-1 text-[#b6bbca] hover:bg-[#314838] hover:text-white"
                            onClick={() => {
                              void onStageFile(file.path)
                            }}
                            disabled={staging || discarding || !!runningAction}
                            title="Stage"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1 text-[#b6bbca] hover:bg-[#4b2f34] hover:text-white"
                            onClick={() => {
                              void onDiscardFile(file.bucket, file.path)
                            }}
                            disabled={staging || discarding || !!runningAction}
                            title="Discard"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="px-2 py-2 text-[11px] text-[#8c92a5]">No files.</div>
            )}
          </div>
        ) : null}
      </div>
    )
  }

  const canCommit = !!commitMessage.trim() && stagedFiles.length > 0 && !runningAction

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#111216] text-[#d8dbe3]">
      <div className="grid h-full grid-rows-[1fr_34px]">
        <div
          className="grid min-h-0"
          style={{ gridTemplateColumns: sidebarOpen ? '320px 1fr' : '1fr' }}
        >
          {sidebarOpen ? (
          <aside className="flex min-h-0 flex-col overflow-hidden overflow-x-hidden border-r border-[#2f3138] bg-[#17181d]">
            <div className="border-b border-[#2f3138] px-3 py-2">
              <div className="text-[11px] font-semibold tracking-[0.14em] text-[#aeb5c6]">SOURCE CONTROL</div>
              <div className="mt-1 truncate text-xs text-[#7f8698]">
                {snapshot ? `${repoLabel(snapshot.repoRoot)} · ${snapshot.branch}` : 'No repo selected'}
              </div>
            </div>

            <div className="border-b border-[#2f3138] p-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="rounded p-1.5 text-[#b7bdcc] hover:bg-[#2b2f3a] hover:text-white disabled:opacity-50"
                  title="Refresh"
                  onClick={() => {
                    void onRefresh()
                  }}
                  disabled={!activeRepo || loadingSnapshot || runningAction !== ''}
                >
                  <RefreshCw className={`h-4 w-4 ${loadingSnapshot ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="mt-2 rounded border border-[#32353f] bg-[#101116] p-1.5">
                <Input
                  value={commitMessage}
                  onChange={(e) => state$.commitMessage.set(e.target.value)}
                  placeholder="Message (Cmd+Enter to commit)"
                  className="h-7 border-[#3a3d48] bg-[#151721] text-xs"
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                      e.preventDefault()
                      void onCommit()
                    }
                  }}
                />
                <button
                  type="button"
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded bg-[#f1cad2] px-2 py-1.5 text-xs font-semibold text-[#1b1c20] hover:bg-[#f6d7dd] disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={() => {
                    void onCommit()
                  }}
                  disabled={!canCommit}
                >
                  <GitCommitHorizontal className="h-3.5 w-3.5" />
                  {runningAction === 'commit' ? 'Committing...' : 'Commit'}
                </button>
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
              <div className="space-y-2">
                {renderSection('staged', 'STAGED CHANGES', stagedRows)}
                {renderSection('unstaged', 'CHANGES', changedFiles)}
              </div>
            </ScrollArea>
          </aside>
          ) : null}

          <main className="min-h-0">
            {!activeRepo ? (
              <div className="p-3 text-sm text-[#8f96a8]">Select a repository tab or add one with +.</div>
            ) : error ? (
              <div className="p-3 text-sm text-red-400">{error}</div>
            ) : loadingPatch ? (
              <div className="p-3 text-sm text-[#8f96a8]">Loading patch...</div>
            ) : !activePath ? (
              <div className="p-3 text-sm text-[#8f96a8]">Select a file to view diff.</div>
            ) : !patch.trim() ? (
              <div className="p-3 text-sm text-[#8f96a8]">No diff content.</div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-1 border-b border-[#2f3138] px-2 py-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSidebarOpen((v) => !v)}
                    title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
                  >
                    <PanelLeft className="mr-1 h-3.5 w-3.5" />
                    {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
                  </Button>

                  <Button
                    size="sm"
                    variant={diffStyle === 'split' ? 'secondary' : 'ghost'}
                    onClick={() => state$.diffStyle.set('split')}
                  >
                    <GitPullRequestArrow className="mr-1 h-3.5 w-3.5" /> Split
                  </Button>
                  <Button
                    size="sm"
                    variant={diffStyle === 'unified' ? 'secondary' : 'ghost'}
                    onClick={() => state$.diffStyle.set('unified')}
                  >
                    <Check className="mr-1 h-3.5 w-3.5" /> Unified
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void copyComments('file')
                    }}
                    disabled={!activePath || currentFileComments.length === 0}
                  >
                    Copy Comments (File)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void copyComments('all')
                    }}
                    disabled={safeComments.length === 0}
                  >
                    Copy Comments (All)
                  </Button>
                  <div className="ml-auto text-xs text-[#8f96a8]">
                    {activePath} <Badge variant="secondary">{activeBucket}</Badge>
                  </div>
                </div>

                {currentFileComments.length > 0 ? (
                  <div className="border-b border-[#2f3138] px-2 py-1">
                    <div className="space-y-1">
                      {currentFileComments.map((comment) => (
                        <div
                          key={comment.id}
                          className="flex items-center gap-2 rounded bg-[#23262f] px-2 py-1 text-[11px]"
                        >
                          <span className="text-[#8f96a8]">{formatRange(comment.startLine, comment.endLine)}</span>
                          <span className="truncate">{comment.text}</span>
                          <button
                            type="button"
                            className="ml-auto text-[#9ea7bb] hover:text-white"
                            onClick={() => removeComment(comment.id)}
                          >
                            x
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div
                  ref={diffViewportRef}
                  className="relative min-h-0 flex-1 overflow-auto"
                  onScroll={onDiffViewportScroll}
                >
                  {currentFileDiff ? (
                    <FileDiff
                      fileDiff={currentFileDiff}
                      selectedLines={selectedRange}
                      lineAnnotations={currentAnnotations}
                      renderAnnotation={renderCommentAnnotation}
                      options={diffOptions}
                    />
                  ) : (
                    <div className="p-3 text-xs text-[#8f96a8]">Could not parse patch for caching.</div>
                  )}

                  {selectedRange && composerPos.visible ? (
                    <div
                      className="absolute z-20 w-80 rounded border border-[#3a3d48] bg-[#1a1d25] p-2 shadow-xl"
                      style={{ top: composerPos.top, left: composerPos.left }}
                    >
                      <div className="mb-1 text-[11px] text-[#c5cada]">
                        Comment on {formatRange(normalizeRange(selectedRange).start, normalizeRange(selectedRange).end)}
                      </div>
                      <Input
                        ref={composerInputRef}
                        value={draftComment}
                        onChange={(e) => state$.draftComment.set(e.target.value)}
                        placeholder="Type comment"
                        className="h-7 border-[#3a3d48] bg-[#10131a] text-xs"
                      />
                      <div className="mt-2 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={addComment}
                          disabled={!draftComment.trim() || !activePath}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            state$.selectedRange.set(null)
                            state$.draftComment.set('')
                            setComposerPos((prev) => ({ ...prev, visible: false }))
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </main>
        </div>

        <div className="border-t border-[#2f3138] bg-[#17181d] px-2">
          <div className="flex h-full items-center gap-1">
            <button
              type="button"
              className="rounded border border-[#3a3d46] px-2 py-0.5 text-xs text-[#aeb5c6] hover:bg-[#23262e]"
              onClick={() => setSidebarOpen((v) => !v)}
              title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
            >
              {sidebarOpen ? 'Hide' : 'Show'}
            </button>

            {repos.map((repo) => {
              const repoPath = repo ?? ''
              if (!repoPath) return null

              return (
                <button
                  key={repoPath}
                  type="button"
                  className={`rounded border px-2 py-0.5 text-xs ${
                    repoPath === activeRepo
                      ? 'border-[#505768] bg-[#2c3240] text-[#e5e8f0]'
                      : 'border-[#3a3d46] text-[#aeb5c6] hover:bg-[#23262e]'
                  }`}
                  onClick={() => {
                    void onSelectRepo(repoPath)
                  }}
                  title={repoPath}
                >
                  {repoLabel(repoPath)}
                </button>
              )
            })}

            <button
              type="button"
              className="rounded border border-[#3a3d46] px-2 py-0.5 text-xs text-[#aeb5c6] hover:bg-[#23262e]"
              onClick={() => {
                void selectFolder()
              }}
              title="Add repository"
            >
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default App
