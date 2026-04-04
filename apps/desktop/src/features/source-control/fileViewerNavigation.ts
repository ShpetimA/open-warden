import type { LspLocation } from "@/features/source-control/types";
import type { FileViewerTarget } from "@/features/source-control/types";

let nextFileViewerFocusKey = 1;

export function createFileViewerFocusKey() {
  const focusKey = nextFileViewerFocusKey;
  nextFileViewerFocusKey += 1;
  return focusKey;
}

export function createFocusedFileViewerTarget(location: LspLocation): FileViewerTarget {
  return {
    repoPath: location.repoPath,
    relPath: location.relPath,
    line: location.line,
    column: location.character,
    focusKey: createFileViewerFocusKey(),
  };
}
