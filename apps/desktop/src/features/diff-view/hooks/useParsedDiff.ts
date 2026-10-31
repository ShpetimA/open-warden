import type { DesktopResult } from "@/platform/desktop/failure";
import { useEffect, useRef, useState } from "react";

import { getDiffRenderGate } from "@/features/diff-view/services/diffRenderLimits";
import {
  getCachedParsedDiff,
  getParsedDiffRequest,
  isParsedDiffInFlight,
  loadParsedDiff,
  peekCachedParsedDiff,
  type ParsedDiff,
} from "@/features/diff-view/services/parsedDiffCache";
import type { DiffFile } from "@/features/source-control/types";

type ParsedDiffState = { key: string; outcome: DesktopResult<ParsedDiff> };

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
  const [attempt, setAttempt] = useState(0);
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

    void loadParsedDiff(nextRequestPayload, "high").then((outcome) => {
      if (parseRequestTokenRef.current !== requestToken) return;
      if (!outcome.ok && outcome.error.code === "cancelled") {
        setAttempt((value) => value + 1);
        return;
      }
      setParsedState({ key: nextRequestPayload.key, outcome });
    });
  }, [activePath, allowLargeDiff, cacheSalt, newFile, oldFile, attempt]);

  const requestKey = requestPayload?.key ?? null;
  const cachedDiff = requestKey ? peekCachedParsedDiff(requestKey) : undefined;
  const outcome = parsedState?.key === requestKey ? parsedState.outcome : null;
  const parseError = outcome && !outcome.ok ? outcome.error : undefined;
  const currentFileDiff =
    cachedDiff !== undefined ? cachedDiff : outcome?.ok ? outcome.value : null;
  const isParsingDiff =
    requestKey !== null &&
    cachedDiff === undefined &&
    (isParsedDiffInFlight(requestKey) || parsedState?.key !== requestKey);

  return {
    currentFileDiff,
    diffRenderGate,
    isParsingDiff,
    parseError,
    retryParsing: () => {
      setParsedState(null);
      setAttempt((value) => value + 1);
    },
  };
}
