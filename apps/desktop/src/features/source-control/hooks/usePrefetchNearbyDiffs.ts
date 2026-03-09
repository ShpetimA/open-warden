import { useEffect, useRef } from 'react'
import { useAsyncQueuer } from '@tanstack/react-pacer'
import { useTheme } from 'next-themes'
import { useStore } from 'react-redux'

import { useAppDispatch } from '@/app/hooks'
import type { AppDispatch, RootState } from '@/app/store'
import {
  getDiffThemeCacheSalt,
  getDiffThemeType,
} from '@/features/diff-view/diffRenderConfig'
import { prefetchParsedDiff } from '@/features/diff-view/services/parsedDiffCache'
import { gitApi } from '@/features/source-control/api'
import type { BucketedFile, FileItem, FileVersions } from '@/features/source-control/types'

const DEFAULT_LOOKAHEAD = 4
const DEFAULT_LOOKBEHIND = 2

type NavigationDirection = -1 | 0 | 1

type QueryArgs =
  | { repoPath: string; bucket: BucketedFile['bucket']; relPath: string }
  | { repoPath: string; commitId: string; relPath: string; previousPath?: string }
  | { repoPath: string; baseRef: string; headRef: string; relPath: string; previousPath?: string }

type NearbyDiffItem = {
  key: string
  path: string
  queryArgs: QueryArgs
}

type PrefetchTask = {
  cacheSalt: string
  item: NearbyDiffItem
  orderIndex: number
}

function getItemsSignature(items: NearbyDiffItem[]): string {
  return items
    .map((item) => {
      if ('bucket' in item.queryArgs) {
        return `changes:${item.key}:${item.queryArgs.repoPath}:${item.queryArgs.bucket}:${item.queryArgs.relPath}`
      }

      if ('commitId' in item.queryArgs) {
        return `history:${item.key}:${item.queryArgs.repoPath}:${item.queryArgs.commitId}:${item.queryArgs.relPath}:${item.queryArgs.previousPath ?? ''}`
      }

      return `review:${item.key}:${item.queryArgs.repoPath}:${item.queryArgs.baseRef}:${item.queryArgs.headRef}:${item.queryArgs.relPath}:${item.queryArgs.previousPath ?? ''}`
    })
    .join('\u0000')
}

function pushIndex(indexes: number[], seen: Set<number>, index: number, count: number) {
  if (index < 0 || index >= count || seen.has(index)) return
  seen.add(index)
  indexes.push(index)
}

function getPrefetchOrder(
  activeIndex: number,
  itemCount: number,
  direction: NavigationDirection,
): number[] {
  const indexes: number[] = []
  const seen = new Set<number>()

  pushIndex(indexes, seen, activeIndex, itemCount)

  if (direction > 0) {
    for (let offset = 1; offset <= DEFAULT_LOOKAHEAD; offset += 1) {
      pushIndex(indexes, seen, activeIndex + offset, itemCount)
    }
    for (let offset = 1; offset <= DEFAULT_LOOKBEHIND; offset += 1) {
      pushIndex(indexes, seen, activeIndex - offset, itemCount)
    }
    return indexes
  }

  if (direction < 0) {
    for (let offset = 1; offset <= DEFAULT_LOOKAHEAD; offset += 1) {
      pushIndex(indexes, seen, activeIndex - offset, itemCount)
    }
    for (let offset = 1; offset <= DEFAULT_LOOKBEHIND; offset += 1) {
      pushIndex(indexes, seen, activeIndex + offset, itemCount)
    }
    return indexes
  }

  for (let offset = 1; offset <= DEFAULT_LOOKAHEAD; offset += 1) {
    pushIndex(indexes, seen, activeIndex + offset, itemCount)
    if (offset <= DEFAULT_LOOKBEHIND) {
      pushIndex(indexes, seen, activeIndex - offset, itemCount)
    }
  }

  return indexes
}

function selectCachedVersions(state: RootState, item: NearbyDiffItem): FileVersions | undefined {
  if ('bucket' in item.queryArgs) {
    return gitApi.endpoints.getFileVersions.select(item.queryArgs)(state).data
  }

  if ('commitId' in item.queryArgs) {
    return gitApi.endpoints.getCommitFileVersions.select(item.queryArgs)(state).data
  }

  return gitApi.endpoints.getBranchFileVersions.select(item.queryArgs)(state).data
}

function loadVersions(dispatch: AppDispatch, item: NearbyDiffItem) {
  if ('bucket' in item.queryArgs) {
    return dispatch(gitApi.endpoints.getFileVersions.initiate(item.queryArgs))
  }

  if ('commitId' in item.queryArgs) {
    return dispatch(gitApi.endpoints.getCommitFileVersions.initiate(item.queryArgs))
  }

  return dispatch(gitApi.endpoints.getBranchFileVersions.initiate(item.queryArgs))
}

function usePrefetchNearbyDiffs(items: NearbyDiffItem[], activeKey: string) {
  const dispatch = useAppDispatch()
  const store = useStore<RootState>()
  const { resolvedTheme } = useTheme()
  const previousIndexRef = useRef<number | null>(null)
  const previousItemsSignatureRef = useRef('')
  const stableItemsRef = useRef(items)

  const diffThemeType = getDiffThemeType(resolvedTheme)
  const cacheSalt = getDiffThemeCacheSalt(diffThemeType)
  const itemsSignature = getItemsSignature(items)
  if (getItemsSignature(stableItemsRef.current) !== itemsSignature) {
    stableItemsRef.current = items
  }
  const stableItems = stableItemsRef.current

  const prefetchQueuer = useAsyncQueuer<PrefetchTask, null>(
    async (task: PrefetchTask) => {
      const queueAbortSignal = prefetchQueuer.getAbortSignal()
      let activeRequest: ReturnType<typeof loadVersions> | null = null

      const abortActiveRequest = () => {
        activeRequest?.abort?.()
        activeRequest?.unsubscribe?.()
        activeRequest = null
      }

      queueAbortSignal?.addEventListener('abort', abortActiveRequest, { once: true })

      try {
        let versions = selectCachedVersions(store.getState(), task.item)

        if (!versions) {
          activeRequest = loadVersions(dispatch, task.item)
          versions = await activeRequest.unwrap()
        }

        if (!versions || queueAbortSignal?.aborted) return

        const parsePromise = prefetchParsedDiff({
          activePath: task.item.path,
          oldFile: versions.oldFile ?? null,
          newFile: versions.newFile ?? null,
          cacheSalt: task.cacheSalt,
          priority: task.orderIndex === 0 ? 'high' : 'low',
        })

        if (task.orderIndex === 0) {
          await parsePromise
        }
      } catch {
        if (!queueAbortSignal?.aborted) {
          return
        }
      } finally {
        abortActiveRequest()
        queueAbortSignal?.removeEventListener('abort', abortActiveRequest)
      }
    },
    {
      concurrency: 1,
      getPriority: (task) => -task.orderIndex,
      onError: () => {},
      onUnmount: (queuer) => {
        queuer.abort()
        queuer.clear()
        queuer.stop()
      },
      throwOnError: false,
    },
    () => null,
  )

  useEffect(() => {
    if (!activeKey || stableItems.length === 0) {
      prefetchQueuer.abort()
      prefetchQueuer.clear()
      previousIndexRef.current = null
      previousItemsSignatureRef.current = itemsSignature
      return
    }

    if (previousItemsSignatureRef.current !== itemsSignature) {
      previousIndexRef.current = null
      previousItemsSignatureRef.current = itemsSignature
    }

    const activeIndex = stableItems.findIndex((item) => item.key === activeKey)
    if (activeIndex < 0) {
      prefetchQueuer.abort()
      prefetchQueuer.clear()
      previousIndexRef.current = null
      return
    }

    const previousIndex = previousIndexRef.current
    const direction: NavigationDirection =
      previousIndex === null ? 0 : activeIndex > previousIndex ? 1 : activeIndex < previousIndex ? -1 : 0
    previousIndexRef.current = activeIndex

    const orderedIndexes = getPrefetchOrder(activeIndex, stableItems.length, direction)
    prefetchQueuer.abort()
    prefetchQueuer.clear()

    for (const [orderIndex, itemIndex] of orderedIndexes.entries()) {
      const item = stableItems[itemIndex]
      if (!item) continue

      prefetchQueuer.addItem({
        cacheSalt,
        item,
        orderIndex,
      })
    }

    return () => {
      prefetchQueuer.abort()
      prefetchQueuer.clear()
    }
  }, [activeKey, cacheSalt, itemsSignature, prefetchQueuer, stableItems])
}

export function usePrefetchChangesDiffs(
  items: BucketedFile[],
  activeRepo: string,
  activeBucket: BucketedFile['bucket'],
  activePath: string,
) {
  const activeKey = activePath ? `${activeBucket}\u0000${activePath}` : ''
  usePrefetchNearbyDiffs(
    activeRepo
      ? items.map((item) => ({
          key: `${item.bucket}\u0000${item.path}`,
          path: item.path,
          queryArgs: {
            repoPath: activeRepo,
            bucket: item.bucket,
            relPath: item.path,
          },
        }))
      : [],
    activeKey,
  )
}

export function usePrefetchHistoryDiffs(items: FileItem[], activeRepo: string, commitId: string, activePath: string) {
  const nearbyItems =
    activeRepo && commitId
      ? items.map((item) => ({
          key: item.path,
          path: item.path,
          queryArgs: {
            repoPath: activeRepo,
            commitId,
            relPath: item.path,
            previousPath: item.previousPath ?? undefined,
          },
        }))
      : []

  usePrefetchNearbyDiffs(nearbyItems, activePath)
}

export function usePrefetchReviewDiffs(
  items: FileItem[],
  activeRepo: string,
  baseRef: string,
  headRef: string,
  activePath: string,
) {
  const nearbyItems =
    activeRepo && baseRef && headRef
      ? items.map((item) => ({
          key: item.path,
          path: item.path,
          queryArgs: {
            repoPath: activeRepo,
            baseRef,
            headRef,
            relPath: item.path,
            previousPath: item.previousPath ?? undefined,
          },
        }))
      : []

  usePrefetchNearbyDiffs(nearbyItems, activePath)
}
