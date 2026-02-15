import { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import { clearDiffSelection, setActiveBucket } from '@/features/source-control/sourceControlSlice'
import { findExistingBucket } from '@/features/source-control/utils'

export function useChangesSync() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearDiffSelection())
      return
    }
    if (!snapshot) return
    if (!activePath) return

    const activeBucketHasPath =
      activeBucket === 'unstaged'
        ? snapshot.unstaged.some((file) => file.path === activePath)
        : activeBucket === 'untracked'
          ? snapshot.untracked.some((file) => file.path === activePath)
          : snapshot.staged.some((file) => file.path === activePath)
    if (activeBucketHasPath) return

    const existingBucket = findExistingBucket(snapshot, activePath)
    if (!existingBucket) {
      dispatch(clearDiffSelection())
      return
    }
    if (existingBucket !== activeBucket) {
      dispatch(setActiveBucket(existingBucket))
    }
  }, [activeRepo, activeBucket, activePath, dispatch, snapshot])
}
