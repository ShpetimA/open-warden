import { useHotkey } from '@tanstack/react-hotkeys'
import { useStore } from 'react-redux'

import { useAppDispatch } from '@/app/hooks'
import type { RootState } from '@/app/store'
import { gitApi } from '@/features/source-control/api'
import { setReviewActivePath } from '@/features/source-control/sourceControlSlice'
import type { FileItem } from '@/features/source-control/types'
import { isTypingTarget } from '@/features/source-control/utils'
import { getWrappedNavigationIndex } from '@/lib/keyboard-navigation'

type ReviewKeyboardNavOptions = {
  scrollToIndex?: (targetIndex: number) => void
}

export function useReviewKeyboardNav(options: ReviewKeyboardNavOptions = {}) {
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

    const targetIndex = getWrappedNavigationIndex(activeIndex, allReviewFiles.length, nextKey)

    const targetFile = allReviewFiles[targetIndex]
    if (!targetFile) return
    options.scrollToIndex?.(targetIndex)
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
