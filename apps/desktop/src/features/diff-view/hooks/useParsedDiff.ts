import { useEffect, useMemo, useRef, useState } from 'react'

import { parseDiffInWorker } from '@/features/diff-view/services/parseDiffInWorker'
import type { DiffFile } from '@/features/source-control/types'

type ParsedDiff = Awaited<ReturnType<typeof parseDiffInWorker>>
type ParsedDiffState = { key: string; diff: ParsedDiff | null }
type ParseWorkerFile = DiffFile & { cacheKey?: string }

function hashStringFNV1a(value: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(36)
}

function getFileCacheKey(file: DiffFile): string {
  const nameHash = hashStringFNV1a(file.name)
  const contentsHash = hashStringFNV1a(file.contents)

  return `f-${nameHash}-${file.contents.length}-${contentsHash}`
}

function withCacheKey(file: DiffFile): ParseWorkerFile {
  return {
    ...file,
    cacheKey: getFileCacheKey(file),
  }
}

function getRequestPayload(
  activePath: string,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
): { key: string; oldFile: ParseWorkerFile; newFile: ParseWorkerFile } {
  const oldTargetFile = oldFile ?? { name: activePath, contents: '' }
  const newTargetFile = newFile ?? { name: activePath, contents: '' }
  const oldFileWithCacheKey = withCacheKey(oldTargetFile)
  const newFileWithCacheKey = withCacheKey(newTargetFile)

  return {
    key: `${oldFileWithCacheKey.cacheKey}:${newFileWithCacheKey.cacheKey}`,
    oldFile: oldFileWithCacheKey,
    newFile: newFileWithCacheKey,
  }
}

type UseParsedDiffArgs = {
  activePath: string | null
  oldFile: DiffFile | null
  newFile: DiffFile | null
}

export function useParsedDiff({ activePath, oldFile, newFile }: UseParsedDiffArgs) {
  const parseRequestTokenRef = useRef(0)
  const [parsedState, setParsedState] = useState<ParsedDiffState | null>(null)

  const requestPayload = useMemo(() => {
    if (!activePath || (!oldFile && !newFile)) return null
    return getRequestPayload(activePath, oldFile, newFile)
  }, [activePath, oldFile, newFile])

  useEffect(() => {
    const requestToken = parseRequestTokenRef.current + 1
    parseRequestTokenRef.current = requestToken

    if (!requestPayload) {
      return
    }

    if (parsedState?.key === requestPayload.key) {
      return
    }

    const controller = new AbortController()

    void parseDiffInWorker(
      requestPayload.oldFile,
      requestPayload.newFile,
      controller.signal,
    )
      .then((parsedDiff) => {
        if (parseRequestTokenRef.current !== requestToken) return
        setParsedState({ key: requestPayload.key, diff: parsedDiff })
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        if (parseRequestTokenRef.current !== requestToken) return

        setParsedState({ key: requestPayload.key, diff: null })
      })

    return () => {
      controller.abort()
    }
  }, [parsedState?.key, requestPayload])

  const requestKey = requestPayload?.key ?? null
  const currentFileDiff = requestKey && parsedState?.key === requestKey ? (parsedState.diff ?? null) : null
  const isParsingDiff = requestKey !== null && parsedState?.key !== requestKey

  return { currentFileDiff, isParsingDiff }
}
