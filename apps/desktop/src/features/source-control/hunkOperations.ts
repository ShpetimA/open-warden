import { diffAcceptRejectHunk, type FileDiffMetadata } from "@pierre/diffs";

export type DiffHunkOperation = "stage" | "unstage" | "discard";

export type DiffHunkActionPayload = {
  fileDiff: FileDiffMetadata;
  hunkIndex: number;
};

export type DiffHunkActionAnnotation = DiffHunkActionPayload & {
  type: "hunk-action";
  operations: DiffHunkOperation[];
  onAction: (operation: DiffHunkOperation, payload: DiffHunkActionPayload) => void;
};

function contentsFromAdditionLines(diff: FileDiffMetadata) {
  return diff.additionLines.join("");
}

export function buildIndexContentsForHunkOperation({
  fileDiff,
  hunkIndex,
  operation,
}: {
  fileDiff: FileDiffMetadata;
  hunkIndex: number;
  operation: DiffHunkOperation;
}) {
  let nextDiff = fileDiff;

  for (let index = fileDiff.hunks.length - 1; index >= 0; index -= 1) {
    const isTarget = index === hunkIndex;
    const resolution =
      operation === "stage" ? (isTarget ? "accept" : "reject") : isTarget ? "reject" : "accept";
    nextDiff = diffAcceptRejectHunk(nextDiff, index, resolution);
  }

  return contentsFromAdditionLines(nextDiff);
}
