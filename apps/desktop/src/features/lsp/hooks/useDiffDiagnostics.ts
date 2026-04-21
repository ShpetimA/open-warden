import { useAppSelector } from "@/app/hooks";

import { selectLspDiagnosticsForFile } from "../selectors";

const EMPTY_DIAGNOSTICS: ReturnType<typeof selectLspDiagnosticsForFile> = [];

export function useDiffDiagnostics(repoPath: string, relPath: string) {
  return useAppSelector((state) => {
    if (!repoPath || !relPath) {
      return EMPTY_DIAGNOSTICS;
    }

    return selectLspDiagnosticsForFile(state, repoPath, relPath);
  });
}
