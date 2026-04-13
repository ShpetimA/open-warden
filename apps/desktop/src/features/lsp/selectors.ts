import type { RootState } from "@/app/store";
import type { LspDiagnostic } from "@/platform/desktop";

import { toLspFileKey } from "./lspSlice";

const EMPTY_DIAGNOSTICS: LspDiagnostic[] = [];

export function selectLspFileStateForFile(state: RootState, repoPath: string, relPath: string) {
  return state.lsp.byFile[toLspFileKey(repoPath, relPath)];
}

export function selectLspDiagnosticsForFile(state: RootState, repoPath: string, relPath: string) {
  return selectLspFileStateForFile(state, repoPath, relPath)?.diagnostics ?? EMPTY_DIAGNOSTICS;
}
