import { useEffect } from 'react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { useGetGitSnapshotQuery } from '@/features/source-control/api'
import {
  clearDiffSelection,
  setActiveBucket,
  setSelectedFiles,
  setSelectionAnchor,
} from '@/features/source-control/sourceControlSlice'
import { findExistingBucket } from '@/features/source-control/utils'

export function useChangesSync() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket)
  const selectedFiles = useAppSelector((state) => state.sourceControl.selectedFiles)
  const selectionAnchor = useAppSelector((state) => state.sourceControl.selectionAnchor)
  const { data: snapshot } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo })

  useEffect(() => {
    if (!activeRepo) {
      dispatch(clearDiffSelection())
      return
    }
    if (!snapshot) return

    const stillPresent = selectedFiles.filter((file) => {
      return (
        (file.bucket === 'unstaged' && snapshot.unstaged.some((x) => x.path === file.path)) ||
        (file.bucket === 'untracked' && snapshot.untracked.some((x) => x.path === file.path)) ||
        (file.bucket === 'staged' && snapshot.staged.some((x) => x.path === file.path))
      )
    })
    if (stillPresent.length !== selectedFiles.length) {
      dispatch(setSelectedFiles(stillPresent))
    }

    if (selectionAnchor) {
      const anchorStillPresent =
        (selectionAnchor.bucket === 'unstaged' &&
          snapshot.unstaged.some((x) => x.path === selectionAnchor.path)) ||
        (selectionAnchor.bucket === 'untracked' &&
          snapshot.untracked.some((x) => x.path === selectionAnchor.path)) ||
        (selectionAnchor.bucket === 'staged' &&
          snapshot.staged.some((x) => x.path === selectionAnchor.path))
      if (!anchorStillPresent) {
        dispatch(setSelectionAnchor(null))
      }
    }

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

  }, [
    activeRepo,
    activeBucket,
    activePath,
    dispatch,
    selectedFiles,
    selectionAnchor,
    snapshot,
  ])
}
