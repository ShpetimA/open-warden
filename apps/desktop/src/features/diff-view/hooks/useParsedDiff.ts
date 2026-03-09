import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getDiffRenderGate,
  type DiffRenderGate,
} from '@/features/diff-view/services/diffRenderLimits'
import {
  getCachedParsedDiff,
  getParsedDiffRequest,
  isParsedDiffInFlight,
  loadParsedDiff,
  peekCachedParsedDiff,
  type ParsedDiff,
} from '@/features/diff-view/services/parsedDiffCache'
import type { DiffFile } from '@/features/source-control/types'

type ParsedDiffState = { key: string; diff: ParsedDiff | null }

type UseParsedDiffArgs = {
  activePath: string | null
  oldFile: DiffFile | null
  newFile: DiffFile | null
  cacheSalt?: string
  allowLargeDiff?: boolean
}

export function useParsedDiff({
  activePath,
  oldFile,
  newFile,
  cacheSalt = '',
  allowLargeDiff = false,
}: UseParsedDiffArgs) {
  const parseRequestTokenRef = useRef(0)
  const [parsedState, setParsedState] = useState<ParsedDiffState | null>(null)

  const diffRenderGate = useMemo<DiffRenderGate | null>(() => {
    return getDiffRenderGate(activePath, oldFile, newFile)
  }, [activePath, oldFile, newFile])

  const requestPayload = useMemo(() => {
    return getParsedDiffRequest(activePath, oldFile, newFile, cacheSalt, { allowLargeDiff })
  }, [activePath, oldFile, newFile, cacheSalt, allowLargeDiff])

  useEffect(() => {
    const requestToken = parseRequestTokenRef.current + 1
    parseRequestTokenRef.current = requestToken

    if (!requestPayload) {
      return
    }

    const cachedDiff = getCachedParsedDiff(requestPayload.key)
    if (cachedDiff !== undefined) {
      return
    }

    void loadParsedDiff(requestPayload, 'high').then((parsedDiff) => {
      if (parseRequestTokenRef.current !== requestToken) return
      setParsedState({ key: requestPayload.key, diff: parsedDiff })
    })
  }, [requestPayload])

  const requestKey = requestPayload?.key ?? null
  const cachedDiff = requestKey ? peekCachedParsedDiff(requestKey) : undefined
  const currentFileDiff =
    cachedDiff !== undefined
      ? cachedDiff
      : requestKey && parsedState?.key === requestKey
        ? (parsedState.diff ?? null)
        : null
  const isParsingDiff =
    requestKey !== null &&
    cachedDiff === undefined &&
    (isParsedDiffInFlight(requestKey) || parsedState?.key !== requestKey)

  return { currentFileDiff, diffRenderGate, isParsingDiff }
}
