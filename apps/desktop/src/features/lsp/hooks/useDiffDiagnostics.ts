import type { DiffLineAnnotation } from "@pierre/diffs";

import { useAppSelector } from "@/app/hooks";
import type { DiffAnnotationItem } from "@/features/source-control/types";

import { selectLspDiagnosticsForFile } from "../selectors";

const EMPTY_DIAGNOSTICS: ReturnType<typeof selectLspDiagnosticsForFile> = [];

export function useDiffDiagnostics(repoPath: string, relPath: string) {
  const diagnostics = useAppSelector((state) => {
    if (!repoPath || !relPath) {
      return EMPTY_DIAGNOSTICS;
    }

    return selectLspDiagnosticsForFile(state, repoPath, relPath);
  });

  return diagnostics.map(
    (diagnostic): DiffLineAnnotation<DiffAnnotationItem> => ({
      side: "additions",
      lineNumber: diagnostic.endLine,
      metadata: {
        type: "diagnostic",
        diagnostic,
      },
    }),
  );
}
