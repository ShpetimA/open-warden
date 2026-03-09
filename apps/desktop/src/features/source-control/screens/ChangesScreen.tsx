import { skipToken } from '@reduxjs/toolkit/query'

import { useAppSelector } from '@/app/hooks'
import { DiffWorkspace } from '@/features/diff-view/DiffWorkspace'
import { useGetFileVersionsQuery } from '@/features/source-control/api'
import { useChangesKeyboardNav } from '@/features/source-control/hooks/useChangesKeyboardNav'
import { usePrefetchChangesDiffs } from '@/features/source-control/hooks/usePrefetchNearbyDiffs'
import { useChangesSync } from '@/features/source-control/hooks/useChangesSync'
import { errorMessageFrom } from '@/features/source-control/shared-utils/errorMessage'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import type { BucketedFile } from '@/features/source-control/types'

export function ChangesScreen() {
  useChangesKeyboardNav()
  useChangesSync()

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const collapseStaged = useAppSelector((state) => state.sourceControl.collapseStaged)
  const collapseUnstaged = useAppSelector((state) => state.sourceControl.collapseUnstaged)
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })

  const visibleRows: BucketedFile[] = [
    ...(collapseStaged ? [] : (snapshot?.staged ?? []).map((file) => ({ ...file, bucket: 'staged' as const }))),
    ...(collapseUnstaged
      ? []
      : [
          ...(snapshot?.unstaged ?? []).map((file) => ({ ...file, bucket: 'unstaged' as const })),
          ...(snapshot?.untracked ?? []).map((file) => ({ ...file, bucket: 'untracked' as const })),
        ]),
  ]

  usePrefetchChangesDiffs(visibleRows, activeRepo, activeBucket, activePath)

  const workingFileVersions = useGetFileVersionsQuery(
    activeRepo && activePath
      ? { repoPath: activeRepo, bucket: activeBucket, relPath: activePath }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  )
  const fileVersions = workingFileVersions.data
  const loadingPatch = workingFileVersions.isFetching
  const oldFile = fileVersions?.oldFile ?? null
  const newFile = fileVersions?.newFile ?? null
  const errorMessage = errorMessageFrom(workingFileVersions.error, '')

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '1fr' }}>
      <section className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          {errorMessage ? (
            <div className="text-destructive p-3 text-sm">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
          ) : !activePath ? (
            <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
          ) : (
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={activePath}
              commentContext={{ kind: 'changes' }}
              canComment
            />
          )}
        </div>
      </section>
    </div>
  )
}
