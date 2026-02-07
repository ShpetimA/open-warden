import { useMemo } from 'react'
import { useSelector } from '@legendapp/state/react'

import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { confirmDiscard } from '@/features/comments/actions'
import {
  discardChangesGroupAction,
  discardFileAction,
  selectFile,
  selectHistoryCommit,
  setViewMode,
  stageAllAction,
  stageFileAction,
  unstageAllAction,
  unstageFileAction,
} from '@/features/source-control/actions'
import { appState$ } from '@/features/source-control/store'
import type { Bucket, FileItem, HistoryCommit } from '@/features/source-control/types'
import { repoLabel } from '@/features/source-control/utils'
import { CommitBox } from './CommitBox'
import { FileSection } from './FileSection'

export const HISTORY_FILTER_INPUT_ID = 'history-commit-filter'

export function SourceControlSidebar() {
  const activeRepo = useSelector(appState$.activeRepo)
  const viewMode = useSelector(appState$.viewMode)
  const snapshot = useSelector(appState$.snapshot)
  const historyCommits = useSelector(appState$.historyCommits)
  const historyFilter = useSelector(appState$.historyFilter)
  const historyCommitId = useSelector(appState$.historyCommitId)
  const loadingHistoryCommits = useSelector(appState$.loadingHistoryCommits)
  const runningAction = useSelector(appState$.runningAction)
  const commitMessage = useSelector(appState$.commitMessage)
  const collapseStaged = useSelector(appState$.collapseStaged)
  const collapseUnstaged = useSelector(appState$.collapseUnstaged)


  const unstagedFiles = snapshot?.unstaged ?? []
  const stagedFiles = snapshot?.staged ?? []
  const untrackedFiles = snapshot?.untracked ?? []

  const changedFiles = useMemo<Array<FileItem & { bucket: Bucket }>>(
    () => [
      ...unstagedFiles.map((file) => ({ ...file, bucket: 'unstaged' as const })),
      ...untrackedFiles.map((file) => ({ ...file, bucket: 'untracked' as const })),
    ],
    [unstagedFiles, untrackedFiles],
  )
  const stagedRows = useMemo<Array<FileItem & { bucket: Bucket }>>(
    () =>
      stagedFiles.map((file) => ({
        ...file,
        bucket: 'staged' as const,
      })),
    [stagedFiles],
  )

  const canCommit = !!commitMessage.trim() && stagedFiles.length > 0 && !runningAction
  const allHistoryCommits = historyCommits as HistoryCommit[]

  const filteredHistoryCommits = useMemo<HistoryCommit[]>(() => {
    const query = historyFilter.trim().toLowerCase()
    if (!query) return allHistoryCommits

    return allHistoryCommits.filter((commit) => {
      return (
        commit.summary.toLowerCase().includes(query) ||
        commit.shortId.toLowerCase().includes(query) ||
        commit.commitId.toLowerCase().includes(query) ||
        commit.author.toLowerCase().includes(query)
      )
    })
  }, [allHistoryCommits, historyFilter])

  const onToggle = (key: 'staged' | 'unstaged') => {
    if (key === 'staged') {
      appState$.collapseStaged.set(!collapseStaged)
    } else {
      appState$.collapseUnstaged.set(!collapseUnstaged)
    }
    appState$.activeBucket.set(key)
  }

  const onStageAll = () => {
    void stageAllAction()
  }
  const onUnstageAll = () => {
    void unstageAllAction()
  }

  const onDiscardChangesGroup = (files: Array<FileItem & { bucket: Bucket }>) => {
    if (files.length === 0) return
    if (!confirmDiscard(`Discard all changes in CHANGES (${files.length} files)?`)) return
    void discardChangesGroupAction(files)
  }

  const onStageFile = (path: string) => {
    void stageFileAction(path)
  }

  const onUnstageFile = (path: string) => {
    void unstageFileAction(path)
  }

  const onDiscardFile = (bucket: Bucket, path: string) => {
    if (!confirmDiscard(`Discard changes for ${path}?`)) return
    void discardFileAction(bucket, path)
  }

  const onSelectFile = (bucket: Bucket, relPath: string) => {
    void selectFile(bucket, relPath)
  }

  return (
    <aside
      onMouseDown={() => {
        if (viewMode === 'history') {
          appState$.historyNavTarget.set('commits')
        }
      }}
      className="flex min-h-0 flex-col overflow-hidden overflow-x-hidden border-r border-[#2f3138] bg-[#17181d]"
    >
      <div className="border-b border-[#2f3138] px-3 py-2">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#aeb5c6]">SOURCE CONTROL</div>
        <div className="mt-1 truncate text-xs text-[#7f8698]">
          {activeRepo
            ? `${repoLabel(activeRepo)}${snapshot?.branch ? ` · ${snapshot.branch}` : ''}`
            : 'No repo selected'}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1 border border-[#32353f] bg-[#11131a] p-1">
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              viewMode === 'changes'
                ? 'bg-[#2b3140] text-[#ebeffa]'
                : 'text-[#8f96a8] hover:bg-[#222733] hover:text-[#d7deef]'
            }`}
            onClick={() => {
              void setViewMode('changes')
            }}
          >
            Changes
          </button>
          <button
            type="button"
            className={`px-2 py-1 text-xs font-medium ${
              viewMode === 'history'
                ? 'bg-[#2b3140] text-[#ebeffa]'
                : 'text-[#8f96a8] hover:bg-[#222733] hover:text-[#d7deef]'
            }`}
            onClick={() => {
              void setViewMode('history')
            }}
          >
            History
          </button>
        </div>
      </div>

      {viewMode === 'changes' ? (
        <>
          <CommitBox canCommit={canCommit} />

          <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
            <div>
              <FileSection
                sectionKey="staged"
                title="STAGED CHANGES"
                rows={stagedRows}
                collapsed={collapseStaged}
                unstagedCount={unstagedFiles.length}
                untrackedCount={untrackedFiles.length}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                onStageAll={onStageAll}
                onUnstageAll={onUnstageAll}
                onDiscardChangesGroup={onDiscardChangesGroup}
              />
              <FileSection
                sectionKey="unstaged"
                title="CHANGES"
                rows={changedFiles}
                collapsed={collapseUnstaged}
                unstagedCount={unstagedFiles.length}
                untrackedCount={untrackedFiles.length}
                onToggle={onToggle}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                onStageAll={onStageAll}
                onUnstageAll={onUnstageAll}
                onDiscardChangesGroup={onDiscardChangesGroup}
              />
            </div>
          </ScrollArea>
        </>
      ) : (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
          <div className="space-y-2">
            <Input
              id={HISTORY_FILTER_INPUT_ID}
              value={historyFilter}
              onChange={(event) => appState$.historyFilter.set(event.target.value)}
              placeholder="Filter commits (/, msg, id, author)"
              className="h-7 border-[#32353f] bg-[#101116] px-2 text-xs"
            />

            <div className="text-[11px] text-[#7f8698]">
              {filteredHistoryCommits.length} / {historyCommits.length} commits
            </div>

            {loadingHistoryCommits ? (
              <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
                Loading history...
              </div>
            ) : filteredHistoryCommits.length === 0 ? (
              <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
                {historyCommits.length === 0 ? 'No commits found.' : 'No matches.'}
              </div>
            ) : (
              filteredHistoryCommits.map((commit) => {
                return (
                  <button
                    key={commit.commitId}
                    type="button"
                    className={`w-full min-w-0 overflow-hidden border px-2 py-1.5 text-left ${
                      historyCommitId === commit.commitId
                        ? 'border-[#445172] bg-[#262d3d]'
                        : 'border-[#30323a] bg-[#1a1b1f] hover:bg-[#23262d]'
                    }`}
                    onClick={() => {
                      void selectHistoryCommit(commit.commitId)
                    }}
                    title={commit.summary || commit.commitId}
                  >
                    <div className="truncate text-xs font-semibold text-[#e9edf8]">
                      {commit.summary || '(no commit message)'}
                    </div>
                    <div className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-[#8f96a8]">
                      <span className="shrink-0 bg-[#303544] px-1 py-0.5 font-medium text-[#c9d2ea]">
                        {commit.shortId}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{commit.author || 'Unknown'}</span>
                      <span className="shrink-0">{commit.relativeTime}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      )}
    </aside>
  )
}
