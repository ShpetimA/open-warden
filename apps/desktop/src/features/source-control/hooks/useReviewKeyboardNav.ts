import { useHotkey } from '@tanstack/react-hotkeys'
import { useStore } from 'react-redux'

import { useAppDispatch } from '@/app/hooks'
import type { RootState } from '@/app/store'
import { gitApi } from '@/features/source-control/api'
import { setReviewActivePath } from '@/features/source-control/sourceControlSlice'
import type { FileItem } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'

export function useReviewKeyboardNav() {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()

  const getNavigationData = () => {
    const state = store.getState()
    const { activeRepo, reviewBaseRef, reviewHeadRef, reviewActivePath } = state.sourceControl
    const branchFilesArgs =
      activeRepo && reviewBaseRef && reviewHeadRef
        ? {
            repoPath: activeRepo,
            baseRef: reviewBaseRef,
            headRef: reviewHeadRef,
          }
        : null
    const reviewFiles = branchFilesArgs
      ? gitApi.endpoints.getBranchFiles.select(branchFilesArgs)(state).data
      : undefined

    return {
      reviewActivePath,
      allReviewFiles: (reviewFiles ?? []) as FileItem[],
    }
  }

  const navigateReview = (event: KeyboardEvent, nextKey: boolean) => {
    if (isTypingTarget(event.target)) return
    event.preventDefault()

    const { reviewActivePath, allReviewFiles } = getNavigationData()
    if (allReviewFiles.length === 0) return

    const activeIndex = allReviewFiles.findIndex((file) => file.path === reviewActivePath)

    let targetIndex = 0
    if (activeIndex < 0) {
      targetIndex = nextKey ? 0 : allReviewFiles.length - 1
    } else if (nextKey) {
      targetIndex = Math.min(activeIndex + 1, allReviewFiles.length - 1)
    } else {
      targetIndex = Math.max(activeIndex - 1, 0)
    }

    const targetFile = allReviewFiles[targetIndex]
    if (!targetFile) return
    dispatch(setReviewActivePath(targetFile.path))
  }

  useHotkey(
    'ArrowDown',
    (event) => {
      navigateReview(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'J',
    (event) => {
      navigateReview(event, true)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'ArrowUp',
    (event) => {
      navigateReview(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )

  useHotkey(
    'K',
    (event) => {
      navigateReview(event, false)
    },
    { ignoreInputs: false, preventDefault: false, stopPropagation: false },
  )
}
