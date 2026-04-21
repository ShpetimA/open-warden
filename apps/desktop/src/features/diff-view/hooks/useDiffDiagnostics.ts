import { useCallback, useMemo } from "react";

import {
  applyDiagnosticTokenDecorations,
  buildDiagnosticsByLine,
} from "@/features/diff-view/util/lsp_token";
import { useDiagnosticTokenPopover } from "@/features/diff-view/components/DiagnosticTokenPopover";
import type { LspDiagnostic } from "@/features/source-control/types";

export function useDiffDiagnostics(lspDiagnostics: LspDiagnostic[] = []) {
  const diagnosticsByLine = useMemo(() => buildDiagnosticsByLine(lspDiagnostics), [lspDiagnostics]);

  const diagnosticPopover = useDiagnosticTokenPopover(diagnosticsByLine);

  const onPostRender = useCallback(
    (rootNode: HTMLElement) => applyDiagnosticTokenDecorations(rootNode, diagnosticsByLine),
    [diagnosticsByLine],
  );

  return {
    onTokenEnter: diagnosticPopover.onTokenEnter,
    onTokenLeave: diagnosticPopover.onTokenLeave,
    onPostRender,
    popoverState: diagnosticPopover.state,
    popoverHandlers: {
      onClose: diagnosticPopover.closePopover,
      onPointerEnter: diagnosticPopover.onPopoverEnter,
      onPointerLeave: diagnosticPopover.onPopoverLeave,
    },
  };
}
