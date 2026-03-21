import { useEffect, useRef, useState } from "react";

import {
  getDiffRenderGate,
} from "@/features/diff-view/services/diffRenderLimits";
import {
  getCachedParsedDiff,
  getParsedDiffRequest,
  isParsedDiffInFlight,
  loadParsedDiff,
  peekCachedParsedDiff,
  type ParsedDiff,
} from "@/features/diff-view/services/parsedDiffCache";
import type { DiffFile } from "@/features/source-control/types";

type ParsedDiffState = { key: string; diff: ParsedDiff | null };

type UseParsedDiffArgs = {
  activePath: string | null;
  oldFile: DiffFile | null;
  newFile: DiffFile | null;
  cacheSalt?: string;
  allowLargeDiff?: boolean;
};

export function useParsedDiff({
  activePath,
  oldFile,
  newFile,
  cacheSalt = "",
  allowLargeDiff = false,
}: UseParsedDiffArgs) {
  const parseRequestTokenRef = useRef(0);
  const [parsedState, setParsedState] = useState<ParsedDiffState | null>(null);

  const diffRenderGate = getDiffRenderGate(activePath, oldFile, newFile);
  const requestPayload = getParsedDiffRequest(activePath, oldFile, newFile, cacheSalt, {
    allowLargeDiff,
  });

  useEffect(() => {
    const requestToken = parseRequestTokenRef.current + 1;
    parseRequestTokenRef.current = requestToken;

    const nextRequestPayload = getParsedDiffRequest(activePath, oldFile, newFile, cacheSalt, {
      allowLargeDiff,
    });

    if (!nextRequestPayload) {
      return;
    }

    const cachedDiff = getCachedParsedDiff(nextRequestPayload.key);
    if (cachedDiff !== undefined) {
      return;
    }

    void loadParsedDiff(nextRequestPayload, "high").then((parsedDiff) => {
      if (parseRequestTokenRef.current !== requestToken) return;
      setParsedState({ key: nextRequestPayload.key, diff: parsedDiff });
    });
  }, [activePath, allowLargeDiff, cacheSalt, newFile, oldFile]);

  const requestKey = requestPayload?.key ?? null;
  const cachedDiff = requestKey ? peekCachedParsedDiff(requestKey) : undefined;
  const currentFileDiff =
    cachedDiff !== undefined
      ? cachedDiff
      : requestKey && parsedState?.key === requestKey
        ? (parsedState.diff ?? null)
        : null;
  const isParsingDiff =
    requestKey !== null &&
    cachedDiff === undefined &&
    (isParsedDiffInFlight(requestKey) || parsedState?.key !== requestKey);

  return { currentFileDiff, diffRenderGate, isParsingDiff };
}
