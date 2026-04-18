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

function sameDiagnostic(a: LspDiagnostic, b: LspDiagnostic) {
  return (
    a.message === b.message &&
    a.severity === b.severity &&
    a.source === b.source &&
    a.code === b.code &&
    a.startLine === b.startLine &&
    a.endLine === b.endLine &&
    a.startCharacter === b.startCharacter &&
    a.endCharacter === b.endCharacter
  );
}

function sameDiagnostics(a: LspDiagnostic[], b: LspDiagnostic[]) {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right || !sameDiagnostic(left, right)) {
      return false;
    }
  }

  return true;
}

const lspSlice = createSlice({
  name: "lsp",
  initialState,
  reducers: {
    lspDiagnosticsReceived(state, action: PayloadAction<LspDiagnosticsEvent>) {
      const { repoPath, relPath, diagnostics, languageId, reason } = action.payload;
      const key = toLspFileKey(repoPath, relPath);
      const current = state.byFile[key];

      if (
        current &&
        current.languageId === languageId &&
        current.reason === reason &&
        sameDiagnostics(current.diagnostics, diagnostics)
      ) {
        return;
      }

      state.byFile[key] = {
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
