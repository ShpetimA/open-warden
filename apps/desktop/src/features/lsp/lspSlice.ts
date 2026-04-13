import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { LspDiagnostic, LspDiagnosticsEvent } from "@/platform/desktop";

type LspFileState = {
  diagnostics: LspDiagnostic[];
  languageId: string | null;
  reason: string | null;
};

type LspState = {
  byFile: Record<string, LspFileState>;
};

type ClearLspFilePayload = {
  repoPath: string;
  relPath: string;
};

const initialState: LspState = {
  byFile: {},
};

function toLspFileKey(repoPath: string, relPath: string) {
  return `${repoPath}\u0000${relPath}`;
}

const lspSlice = createSlice({
  name: "lsp",
  initialState,
  reducers: {
    lspDiagnosticsReceived(state, action: PayloadAction<LspDiagnosticsEvent>) {
      const { repoPath, relPath, diagnostics, languageId, reason } = action.payload;
      state.byFile[toLspFileKey(repoPath, relPath)] = {
        diagnostics,
        languageId,
        reason,
      };
    },
    clearLspFile(state, action: PayloadAction<ClearLspFilePayload>) {
      delete state.byFile[toLspFileKey(action.payload.repoPath, action.payload.relPath)];
    },
  },
});

export const { clearLspFile, lspDiagnosticsReceived } = lspSlice.actions;
export const lspReducer = lspSlice.reducer;
export { toLspFileKey };
