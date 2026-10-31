import { desktopFailure, desktopSuccess, type DesktopResult } from "@/platform/desktop/failure";
import type { ParsePriority } from "@/features/diff-view/services/parseDiffInWorker";
import { getDiffFileIdentity } from "@/features/diff-view/services/diffFileIdentity";
import { getDiffRenderGate } from "@/features/diff-view/services/diffRenderLimits";
import { parseDiffInWorker } from "@/features/diff-view/services/parseDiffInWorker";
import { WeightedLruCache } from "@/features/diff-view/services/weightedLruCache";
import type { DiffFile } from "@/features/source-control/types";

export type ParsedDiff = Awaited<ReturnType<typeof parseDiffInWorker>>;

type ParseWorkerFile = DiffFile & { cacheKey?: string };

type ParsedDiffRequest = {
  key: string;
  oldFile: ParseWorkerFile;
  newFile: ParseWorkerFile;
};

const MAX_PARSED_DIFF_CACHE_ENTRIES = 24;
const MAX_PARSED_DIFF_CACHE_ESTIMATED_BYTES = 64 * 1024 * 1024;
const MIN_PARSED_DIFF_ESTIMATED_BYTES = 16 * 1024;
const JAVASCRIPT_STRING_BYTES_PER_CHARACTER = 2;
const PARSED_DIFF_STRUCTURE_MULTIPLIER = 4;

type InFlightParse = {
  promise: Promise<DesktopResult<ParsedDiff>>;
  priority: ParsePriority;
  controller: AbortController;
};

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function getFileCacheKey(file: DiffFile): string {
  return getDiffFileIdentity(file);
}

function withCacheKey(file: DiffFile, salt = ""): ParseWorkerFile {
  const baseCacheKey = getFileCacheKey(file);
  return {
    ...file,
    cacheKey: salt ? `${baseCacheKey}:${salt}` : baseCacheKey,
  };
}

function estimateParsedDiffBytes(request: ParsedDiffRequest): number {
  const sourceCharacters = request.oldFile.contents.length + request.newFile.contents.length;
  return Math.max(
    MIN_PARSED_DIFF_ESTIMATED_BYTES,
    sourceCharacters * JAVASCRIPT_STRING_BYTES_PER_CHARACTER * PARSED_DIFF_STRUCTURE_MULTIPLIER,
  );
}

export function getParsedDiffRequest(
  activePath: string | null,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
  cacheSalt = "",
  options: { allowLargeDiff?: boolean } = {},
): ParsedDiffRequest | null {
  const diffRenderGate = getDiffRenderGate(activePath, oldFile, newFile);
  if (!diffRenderGate || diffRenderGate === "unrenderable") return null;
  if (diffRenderGate === "large" && !options.allowLargeDiff) return null;

  const fallbackPath = activePath ?? "";
  const oldTargetFile = oldFile ?? { name: fallbackPath, contents: "" };
  const newTargetFile = newFile ?? { name: fallbackPath, contents: "" };
  const oldFileWithCacheKey = withCacheKey(oldTargetFile, cacheSalt);
  const newFileWithCacheKey = withCacheKey(newTargetFile, cacheSalt);

  return {
    key: `${oldFileWithCacheKey.cacheKey}:${newFileWithCacheKey.cacheKey}`,
    oldFile: oldFileWithCacheKey,
    newFile: newFileWithCacheKey,
  };
}

export function createParsedDiffCache(parse: typeof parseDiffInWorker) {
  const cache = new WeightedLruCache<string, ParsedDiff>({
    maxEntries: MAX_PARSED_DIFF_CACHE_ENTRIES,
    maxWeight: MAX_PARSED_DIFF_CACHE_ESTIMATED_BYTES,
  });
  const inFlightParses = new Map<string, InFlightParse>();

  async function load(
    request: ParsedDiffRequest,
    priority: ParsePriority = "high",
  ): Promise<DesktopResult<ParsedDiff>> {
    const cached = cache.get(request.key);
    if (cached !== undefined) return desktopSuccess(cached);
    const inFlight = inFlightParses.get(request.key);
    if (inFlight && (priority === "low" || inFlight.priority === "high")) return inFlight.promise;
    inFlight?.controller.abort();
    const controller = new AbortController();
    const promise = parse(request.oldFile, request.newFile, controller.signal, priority)
      .then((diff) => {
        cache.set(request.key, diff, estimateParsedDiffBytes(request));
        return desktopSuccess(diff);
      })
      .catch(
        (cause: unknown): DesktopResult<ParsedDiff> => ({
          ok: false,
          error: isAbortError(cause)
            ? desktopFailure("parseDiff", "cancelled", "Diff parsing was cancelled.")
            : desktopFailure(
                "parseDiff",
                "unexpected",
                "The diff could not be parsed. Retry to render it again.",
              ),
        }),
      )
      .finally(() => {
        if (inFlightParses.get(request.key)?.promise === promise)
          inFlightParses.delete(request.key);
      });
    inFlightParses.set(request.key, { promise, priority, controller });
    return promise;
  }
  return {
    load,
    get: (key: string) => cache.get(key),
    peek: (key: string) => cache.peek(key),
    isInFlight: (key: string) => inFlightParses.has(key),
  };
}

const sharedCache = createParsedDiffCache(parseDiffInWorker);
export const loadParsedDiff = sharedCache.load;
export const getCachedParsedDiff = sharedCache.get;
export const peekCachedParsedDiff = sharedCache.peek;
export const isParsedDiffInFlight = sharedCache.isInFlight;

type PrefetchParsedDiffArgs = {
  activePath: string | null;
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  cacheSalt?: string;
  priority?: ParsePriority;
};

export async function prefetchParsedDiff({
  activePath,
  oldFile,
  newFile,
  cacheSalt = "",
  priority = "low",
}: PrefetchParsedDiffArgs): Promise<void> {
  const request = getParsedDiffRequest(activePath, oldFile, newFile, cacheSalt);
  if (!request) return;

  await loadParsedDiff(request, priority);
}
