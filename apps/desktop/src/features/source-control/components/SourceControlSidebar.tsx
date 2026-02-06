import { useState } from 'react'
import { useSelector } from '@legendapp/state/react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { confirmDiscard } from '@/features/comments/actions'
import {
  discardChangesGroupAction,
  discardFileAction,
  selectFile,
  stageAllAction,
  stageFileAction,
  unstageAllAction,
  unstageFileAction,
} from '@/features/source-control/actions'
import { appState$ } from '@/features/source-control/store'
import type { Bucket, FileItem } from '@/features/source-control/types'
import { repoLabel } from '@/features/source-control/utils'
import { CommitBox } from './CommitBox'
import { FileSection } from './FileSection'

export function SourceControlSidebar() {
  const snapshot = useSelector(appState$.snapshot)
  const runningAction = useSelector(appState$.runningAction)
  const commitMessage = useSelector(appState$.commitMessage)

  const [collapse, setCollapse] = useState<Record<'staged' | 'unstaged', boolean>>({
    staged: false,
    unstaged: false,
  })

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

  const canCommit = !!commitMessage.trim() && stagedFiles.length > 0 && !runningAction

  const onToggle = (key: 'staged' | 'unstaged') => {
    setCollapse((prev) => ({ ...prev, [key]: !prev[key] }))
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
    <aside className="flex min-h-0 flex-col overflow-hidden overflow-x-hidden border-r border-[#2f3138] bg-[#17181d]">
      <div className="border-b border-[#2f3138] px-3 py-2">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#aeb5c6]">SOURCE CONTROL</div>
        <div className="mt-1 truncate text-xs text-[#7f8698]">
          {snapshot ? `${repoLabel(snapshot.repoRoot)} · ${snapshot.branch}` : 'No repo selected'}
        </div>
      </div>

      <CommitBox canCommit={canCommit} />

      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2 [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
        <div className="space-y-2">
          <FileSection
            sectionKey="staged"
            title="STAGED CHANGES"
            rows={stagedRows}
            collapsed={collapse.staged}
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
            collapsed={collapse.unstaged}
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
    </aside>
  )
}
