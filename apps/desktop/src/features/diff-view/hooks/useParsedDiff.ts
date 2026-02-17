import { useEffect, useMemo, useRef, useState } from 'react'

import { parseDiffInWorker } from '@/features/diff-view/services/parseDiffInWorker'
import type { DiffFile } from '@/features/source-control/types'

type ParsedDiff = Awaited<ReturnType<typeof parseDiffInWorker>>
type ParsedDiffState = { key: string; diff: ParsedDiff | null }

const parsedDiffCache = new Map<string, ParsedDiff>()

function getDiffCacheKey(
  activePath: string,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
): string {
  return JSON.stringify({
    activePath,
    oldName: oldFile?.name ?? '',
    oldContents: oldFile?.contents ?? '',
    newName: newFile?.name ?? '',
    newContents: newFile?.contents ?? '',
  })
}

type UseParsedDiffArgs = {
  activePath: string | null
  oldFile: DiffFile | null
  newFile: DiffFile | null
}

export function useParsedDiff({ activePath, oldFile, newFile }: UseParsedDiffArgs) {
  const parseRequestTokenRef = useRef(0)
  const [parsedState, setParsedState] = useState<ParsedDiffState | null>(null)

  const activeRequestKey = useMemo(() => {
    if (!activePath || (!oldFile && !newFile)) return null
    return getDiffCacheKey(activePath, oldFile, newFile)
  }, [activePath, oldFile, newFile])

  useEffect(() => {
    const requestToken = parseRequestTokenRef.current + 1
    parseRequestTokenRef.current = requestToken

    if (!activeRequestKey || !activePath) {
      return
    }

    const cachedDiff = parsedDiffCache.get(activeRequestKey)
    if (cachedDiff) {
      return
    }

    const controller = new AbortController()

    void parseDiffInWorker(
      oldFile ?? { name: activePath, contents: '' },
      newFile ?? { name: activePath, contents: '' },
      controller.signal,
    )
      .then((parsedDiff) => {
        if (parseRequestTokenRef.current !== requestToken) return
        parsedDiffCache.set(activeRequestKey, parsedDiff)
        setParsedState({ key: activeRequestKey, diff: parsedDiff })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        if (parseRequestTokenRef.current !== requestToken) return

        setParsedState({ key: activeRequestKey, diff: null })
      })

    return () => {
      controller.abort()
    }
  }, [activeRequestKey, activePath, oldFile, newFile])

  const cachedDiff = activeRequestKey ? (parsedDiffCache.get(activeRequestKey) ?? null) : null
  const currentFileDiff =
    cachedDiff ?? (parsedState?.key === activeRequestKey ? (parsedState.diff ?? null) : null)
  const isParsingDiff =
    activeRequestKey !== null && cachedDiff === null && parsedState?.key !== activeRequestKey

  return { currentFileDiff, isParsingDiff }
}
