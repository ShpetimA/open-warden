import type { ParsePriority } from '@/features/diff-view/services/parseDiffInWorker'
import { getDiffRenderGate } from '@/features/diff-view/services/diffRenderLimits'
import { parseDiffInWorker } from '@/features/diff-view/services/parseDiffInWorker'
import type { DiffFile } from '@/features/source-control/types'

export type ParsedDiff = Awaited<ReturnType<typeof parseDiffInWorker>>

type ParseWorkerFile = DiffFile & { cacheKey?: string }

type ParsedDiffRequest = {
  key: string
  oldFile: ParseWorkerFile
  newFile: ParseWorkerFile
}

const MAX_PARSED_DIFF_CACHE_SIZE = 64

const parsedDiffCache = new Map<string, ParsedDiff | null>()

type InFlightParse = {
  promise: Promise<ParsedDiff | null>
  priority: ParsePriority
  controller: AbortController
}

const inFlightParses = new Map<string, InFlightParse>()

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

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

function withCacheKey(file: DiffFile, salt = ''): ParseWorkerFile {
  const baseCacheKey = getFileCacheKey(file)
  return {
    ...file,
    cacheKey: salt ? `${baseCacheKey}:${salt}` : baseCacheKey,
  }
}

function touchParsedDiff(key: string, diff: ParsedDiff | null) {
  parsedDiffCache.delete(key)
  parsedDiffCache.set(key, diff)

  while (parsedDiffCache.size > MAX_PARSED_DIFF_CACHE_SIZE) {
    const oldestKey = parsedDiffCache.keys().next().value
    if (!oldestKey) break
    parsedDiffCache.delete(oldestKey)
  }
}

export function getParsedDiffRequest(
  activePath: string | null,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
  cacheSalt = '',
  options: { allowLargeDiff?: boolean } = {},
): ParsedDiffRequest | null {
  const diffRenderGate = getDiffRenderGate(activePath, oldFile, newFile)
  if (!diffRenderGate || diffRenderGate === 'unrenderable') return null
  if (diffRenderGate === 'large' && !options.allowLargeDiff) return null

  const fallbackPath = activePath ?? ''
  const oldTargetFile = oldFile ?? { name: fallbackPath, contents: '' }
  const newTargetFile = newFile ?? { name: fallbackPath, contents: '' }
  const oldFileWithCacheKey = withCacheKey(oldTargetFile, cacheSalt)
  const newFileWithCacheKey = withCacheKey(newTargetFile, cacheSalt)

  return {
    key: `${oldFileWithCacheKey.cacheKey}:${newFileWithCacheKey.cacheKey}`,
    oldFile: oldFileWithCacheKey,
    newFile: newFileWithCacheKey,
  }
}

export function getCachedParsedDiff(key: string): ParsedDiff | null | undefined {
  if (!parsedDiffCache.has(key)) return undefined

  const diff = parsedDiffCache.get(key) ?? null
  touchParsedDiff(key, diff)
  return diff
}

export function peekCachedParsedDiff(key: string): ParsedDiff | null | undefined {
  if (!parsedDiffCache.has(key)) return undefined
  return parsedDiffCache.get(key) ?? null
}

export function isParsedDiffInFlight(key: string): boolean {
  return inFlightParses.has(key)
}

export async function loadParsedDiff(
  request: ParsedDiffRequest,
  priority: ParsePriority = 'high',
): Promise<ParsedDiff | null> {
  const cached = getCachedParsedDiff(request.key)
  if (cached !== undefined) return cached

  const inFlight = inFlightParses.get(request.key)
  if (inFlight && (priority === 'low' || inFlight.priority === 'high')) {
    return inFlight.promise
  }

  inFlight?.controller.abort()

  const controller = new AbortController()

  const parsePromise = parseDiffInWorker(
    request.oldFile,
    request.newFile,
    controller.signal,
    priority,
  )
    .then((parsedDiff) => {
      touchParsedDiff(request.key, parsedDiff)
      return parsedDiff
    })
    .catch((error) => {
      if (isAbortError(error)) {
        return null
      }

      touchParsedDiff(request.key, null)
      return null
    })
    .finally(() => {
      const currentInFlight = inFlightParses.get(request.key)
      if (currentInFlight?.promise === parsePromise) {
        inFlightParses.delete(request.key)
      }
    })

  inFlightParses.set(request.key, { promise: parsePromise, priority, controller })
  return parsePromise
}

type PrefetchParsedDiffArgs = {
  activePath: string | null
  oldFile: DiffFile | null
  newFile: DiffFile | null
  cacheSalt?: string
  priority?: ParsePriority
}

export async function prefetchParsedDiff({
  activePath,
  oldFile,
  newFile,
  cacheSalt = '',
  priority = 'low',
}: PrefetchParsedDiffArgs): Promise<void> {
  const request = getParsedDiffRequest(activePath, oldFile, newFile, cacheSalt)
  if (!request) return

  await loadParsedDiff(request, priority)
}
