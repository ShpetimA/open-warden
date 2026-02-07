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
import type { Bucket, BucketedFile } from '@/features/source-control/types'
import { CommitBox } from './CommitBox'
import { FileSection } from './FileSection'

export function ChangesTab() {
  const snapshot = useSelector(appState$.snapshot)
  const runningAction = useSelector(appState$.runningAction)
  const commitMessage = useSelector(appState$.commitMessage)
  const collapseStaged = useSelector(appState$.collapseStaged)
  const collapseUnstaged = useSelector(appState$.collapseUnstaged)
  const loadingSnapshot = useSelector(appState$.loadingSnapshot)

  const unstagedFiles = snapshot?.unstaged ?? []
  const stagedFiles = snapshot?.staged ?? []
  const untrackedFiles = snapshot?.untracked ?? []

  const changedFiles: BucketedFile[] = [
    ...unstagedFiles.map((file) => ({ ...file, bucket: 'unstaged' as const })),
    ...untrackedFiles.map((file) => ({ ...file, bucket: 'untracked' as const })),
  ]
  const stagedRows: BucketedFile[] = stagedFiles.map((file) => ({
    ...file,
    bucket: 'staged' as const,
  }))

  const canCommit = !!commitMessage.trim() && stagedFiles.length > 0 && !runningAction

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

  const onDiscardChangesGroup = (files: BucketedFile[]) => {
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
    <>
      <CommitBox canCommit={canCommit} />

      <ScrollArea className="min-h-0 flex-1 overflow-hidden [&_[data-radix-scroll-area-viewport]]:overflow-x-hidden">
        <div>
          {loadingSnapshot ? (
            <div className="m-2 border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
              Loading changes...
            </div>
          ) : null}
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
  )
}
