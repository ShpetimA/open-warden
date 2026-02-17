import { useHotkey } from '@tanstack/react-hotkeys'
import { useStore } from 'react-redux'

import { useAppDispatch } from '@/app/hooks'
import type { RootState } from '@/app/store'
import { gitApi } from '@/features/source-control/api'
import { selectFile } from '@/features/source-control/actions'
import type { BucketedFile } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'

export function useChangesKeyboardNav() {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()

  const getNavigationData = () => {
    const state = store.getState()
    const { activeBucket, activePath, activeRepo, collapseStaged, collapseUnstaged } =
      state.sourceControl
    const snapshot = activeRepo
      ? gitApi.endpoints.getGitSnapshot.select(activeRepo)(state).data
      : undefined

    return {
      activeBucket,
      activePath,
      collapseStaged,
      collapseUnstaged,
      snapshot,
    }
  }

  const navigateChanges = (event: KeyboardEvent, nextKey: boolean) => {
    if (isTypingTarget(event.target)) return
    event.preventDefault()

    const { activeBucket, activePath, collapseStaged, collapseUnstaged, snapshot } =
      getNavigationData()
    const unstaged = snapshot?.unstaged ?? []
    const staged = snapshot?.staged ?? []
    const untracked = snapshot?.untracked ?? []
    const stagedRows: BucketedFile[] = staged.map((file) => ({
      ...file,
      bucket: 'staged',
    }))
    const changedRows: BucketedFile[] = [
      ...unstaged.map((file) => ({ ...file, bucket: 'unstaged' as const })),
      ...untracked.map((file) => ({ ...file, bucket: 'untracked' as const })),
    ]
    const visibleChangeRows: BucketedFile[] = []
    if (!collapseStaged) visibleChangeRows.push(...stagedRows)
    if (!collapseUnstaged) visibleChangeRows.push(...changedRows)

    if (visibleChangeRows.length === 0) return

    const activeIndex = visibleChangeRows.findIndex(
      (file) => file.bucket === activeBucket && file.path === activePath,
    )

    let targetIndex = 0
    if (activeIndex < 0) {
      targetIndex = nextKey ? 0 : visibleChangeRows.length - 1
    } else if (nextKey) {
      targetIndex = Math.min(activeIndex + 1, visibleChangeRows.length - 1)
    } else {
      targetIndex = Math.max(activeIndex - 1, 0)
    }

    const targetFile = visibleChangeRows[targetIndex]
    if (!targetFile) return
    void dispatch(selectFile(targetFile.bucket, targetFile.path))
  }

  useHotkey(
    'ArrowDown',
    (event) => {
      navigateChanges(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'J',
    (event) => {
      navigateChanges(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'ArrowUp',
    (event) => {
      navigateChanges(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'K',
    (event) => {
      navigateChanges(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )
}
