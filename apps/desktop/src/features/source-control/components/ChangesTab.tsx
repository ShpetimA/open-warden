import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ScrollArea } from '@/components/ui/scroll-area'
import { confirmDiscard } from '@/features/comments/actions'
import { createCommentCountByPathForRepo } from '@/features/comments/selectors'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import {
  discardChangesGroupAction,
  discardFileAction,
  selectFile,
  stageAllAction,
  stageFileAction,
  unstageAllAction,
  unstageFileAction,
} from '@/features/source-control/actions'
import { setActiveBucket, setCollapseStaged, setCollapseUnstaged } from '@/features/source-control/sourceControlSlice'
import type { Bucket, BucketedFile } from '@/features/source-control/types'
import { CommitBox } from './CommitBox'
import { FileSection } from './FileSection'

export function ChangesTab() {
  return (
    <>
      <CommitBox />
      <ChangesFileList />
    </>
  )
}

function ChangesFileList() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const collapseStaged = useAppSelector((state) => state.sourceControl.collapseStaged)
  const collapseUnstaged = useAppSelector((state) => state.sourceControl.collapseUnstaged)
  const commentCounts = useAppSelector((state) => createCommentCountByPathForRepo(state.comments, activeRepo))
  const { snapshot, loadingSnapshot } = useGetGitSnapshotQuery(activeRepo, {
    skip: !activeRepo,
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ data, isFetching }) => ({
      snapshot: data,
      loadingSnapshot: isFetching,
    }),
  })

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

  const onToggle = (key: 'staged' | 'unstaged') => {
    if (key === 'staged') {
      dispatch(setCollapseStaged(!collapseStaged))
    } else {
      dispatch(setCollapseUnstaged(!collapseUnstaged))
    }
    dispatch(setActiveBucket(key))
  }

  const onStageAll = () => {
    void dispatch(stageAllAction())
  }
  const onUnstageAll = () => {
    void dispatch(unstageAllAction())
  }

  const onDiscardChangesGroup = (files: BucketedFile[]) => {
    if (files.length === 0) return
    if (!confirmDiscard(`Discard all changes in CHANGES (${files.length} files)?`)) return
    void dispatch(discardChangesGroupAction(files))
  }

  const onStageFile = (path: string) => {
    void dispatch(stageFileAction(path))
  }

  const onUnstageFile = (path: string) => {
    void dispatch(unstageFileAction(path))
  }

  const onDiscardFile = (bucket: Bucket, path: string) => {
    if (!confirmDiscard(`Discard changes for ${path}?`)) return
    void dispatch(discardFileAction(bucket, path))
  }

  const onSelectFile = (bucket: Bucket, relPath: string) => {
    void dispatch(selectFile(bucket, relPath))
  }

  return (
    <>
      <ScrollArea className="min-h-0 flex-1 overflow-hidden ">
        <div>
          {loadingSnapshot ? (
            <div className="border-input bg-surface text-muted-foreground m-2 border px-2 py-2 text-[11px]">
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
            commentCounts={commentCounts}
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
            commentCounts={commentCounts}
          />
        </div>
      </ScrollArea>
    </>
  )
}
