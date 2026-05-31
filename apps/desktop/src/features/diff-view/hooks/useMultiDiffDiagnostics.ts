import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DiffTokenEventBaseProps } from "@pierre/diffs";

import {
  findDiagnosticsForToken,
  readDiagnosticAnchorRect,
  type DiagnosticPopoverAnchorRect,
} from "@/features/diff-view/util/lsp_token";
import {
  applyDiagnosticTokenDecorations,
  buildDiagnosticsByLine,
} from "@/features/diff-view/util/lsp_token";
import type { LspDiagnostic } from "@/features/source-control/types";

export function useMultiDiffDiagnostics(diagnosticsByItem: Map<string, LspDiagnostic[]>) {
  const diagnosticCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDiagnosticPopoverHoveredRef = useRef(false);
  const renderedRootNodesRef = useRef(new Map<string, HTMLElement>());
  const [state, setState] = useState<{
    open: boolean;
    diagnostics: LspDiagnostic[];
    anchorRect: DiagnosticPopoverAnchorRect | null;
  }>({
    open: false,
    diagnostics: [],
    anchorRect: null,
  });

  const diagnosticsByLineByItem = useMemo(() => {
    const next = new Map<string, Map<number, LspDiagnostic[]>>();
    for (const [itemId, diagnostics] of diagnosticsByItem) {
      next.set(itemId, buildDiagnosticsByLine(diagnostics));
    }
    return next;
  }, [diagnosticsByItem]);

  const closePopover = useCallback(() => {
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
      diagnosticCloseTimerRef.current = null;
    }

    setState({ open: false, diagnostics: [], anchorRect: null });
  }, []);

  const onTokenEnter = useCallback(
    (itemId: string, props: DiffTokenEventBaseProps) => {
      if (diagnosticCloseTimerRef.current) {
        clearTimeout(diagnosticCloseTimerRef.current);
        diagnosticCloseTimerRef.current = null;
      }

      const diagnosticsByLine = diagnosticsByLineByItem.get(itemId);
      const diagnostics = diagnosticsByLine
        ? findDiagnosticsForToken(props.tokenElement, diagnosticsByLine)
        : [];
      if (diagnostics.length === 0) {
        closePopover();
        return;
      }

      setState({
        open: true,
        diagnostics,
        anchorRect: readDiagnosticAnchorRect(props.tokenElement),
      });
    },
    [closePopover, diagnosticsByLineByItem],
  );

  const onTokenLeave = useCallback(() => {
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
    }

    diagnosticCloseTimerRef.current = setTimeout(() => {
      if (!isDiagnosticPopoverHoveredRef.current) {
        closePopover();
      }
    }, 120);
  }, [closePopover]);

  const onPopoverEnter = useCallback(() => {
    isDiagnosticPopoverHoveredRef.current = true;
    if (diagnosticCloseTimerRef.current) {
      clearTimeout(diagnosticCloseTimerRef.current);
      diagnosticCloseTimerRef.current = null;
    }
  }, []);

  const onPopoverLeave = useCallback(() => {
    isDiagnosticPopoverHoveredRef.current = false;
    closePopover();
  }, [closePopover]);

  useEffect(() => {
    // LSP diagnostics can arrive after CodeView renders, so repaint existing roots.
    for (const [itemId, rootNode] of renderedRootNodesRef.current) {
      if (!rootNode.isConnected) {
        renderedRootNodesRef.current.delete(itemId);
        continue;
      }

      applyDiagnosticTokenDecorations(
        rootNode,
        diagnosticsByLineByItem.get(itemId) ?? new Map<number, LspDiagnostic[]>(),
      );
    }
  }, [diagnosticsByLineByItem]);

  const onPostRender = useCallback(
    (itemId: string, rootNode: HTMLElement) => {
      renderedRootNodesRef.current.set(itemId, rootNode);
      applyDiagnosticTokenDecorations(
        rootNode,
        diagnosticsByLineByItem.get(itemId) ?? new Map<number, LspDiagnostic[]>(),
      );
    },
    [diagnosticsByLineByItem],
  );

  return {
    onTokenEnter,
    onTokenLeave,
    onPostRender,
    popoverState: state,
    popoverHandlers: {
      onClose: closePopover,
      onPointerEnter: onPopoverEnter,
      onPointerLeave: onPopoverLeave,
    },
  };
}
