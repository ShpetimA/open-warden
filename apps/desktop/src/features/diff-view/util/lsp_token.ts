import type { LspDiagnostic } from "@/features/source-control/types";

export type DiagnosticPopoverAnchorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const DIAGNOSTIC_SEVERITY_PRIORITY: Record<LspDiagnostic["severity"], number> = {
  error: 4,
  warning: 3,
  information: 2,
  hint: 1,
};

function tokenCanRenderDiagnostic(token: HTMLElement): boolean {
  const lineElement = token.closest<HTMLElement>("[data-line]");
  if (!lineElement) {
    return false;
  }

  return lineCanRenderDiagnostic(lineElement);
}

function getTokenLineNumber(token: HTMLElement): number | null {
  const lineElement = token.closest<HTMLElement>("[data-line]");
  if (!lineElement) {
    return null;
  }

  return readLineNumber(lineElement);
}

function readLineNumber(lineElement: HTMLElement): number | null {
  const value = Number.parseInt(lineElement.getAttribute("data-line") ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

function getHighestDiagnosticSeverity(
  diagnostics: LspDiagnostic[],
): LspDiagnostic["severity"] | null {
  let winningSeverity: LspDiagnostic["severity"] | null = null;
  let winningPriority = -1;

  for (const diagnostic of diagnostics) {
    const priority = DIAGNOSTIC_SEVERITY_PRIORITY[diagnostic.severity];
    if (priority > winningPriority) {
      winningPriority = priority;
      winningSeverity = diagnostic.severity;
    }
  }

  return winningSeverity;
}

function lineCanRenderDiagnostic(lineElement: HTMLElement): boolean {
  const lineType = lineElement.getAttribute("data-line-type");
  if (lineType === "change-deletion") {
    return false;
  }

  if (lineElement.closest("[data-additions]")) {
    return true;
  }

  if (lineElement.closest("[data-deletions]")) {
    return false;
  }

  return true;
}

function getTokenCharRange(token: HTMLElement): { start: number; end: number } | null {
  const startValue = Number.parseInt(token.getAttribute("data-char") ?? "", 10);
  if (!Number.isFinite(startValue)) {
    return null;
  }

  const tokenText = token.textContent ?? "";
  const start = startValue + 1;
  const end = start + tokenText.length;
  return { start, end };
}

function tokenOverlapsDiagnostic(
  lineNumber: number,
  tokenStart: number,
  tokenEnd: number,
  diagnostic: LspDiagnostic,
): boolean {
  if (lineNumber < diagnostic.startLine || lineNumber > diagnostic.endLine) {
    return false;
  }

  const rangeStart = lineNumber === diagnostic.startLine ? diagnostic.startCharacter : 1;
  const rangeEndRaw =
    lineNumber === diagnostic.endLine ? diagnostic.endCharacter : Number.MAX_SAFE_INTEGER;
  const rangeEnd = Math.max(rangeEndRaw, rangeStart + 1);
  return tokenStart < rangeEnd && tokenEnd > rangeStart;
}

export function buildDiagnosticsByLine(diagnostics: LspDiagnostic[]): Map<number, LspDiagnostic[]> {
  const diagnosticsByLine = new Map<number, LspDiagnostic[]>();

  for (const diagnostic of diagnostics) {
    const startLine = Math.min(diagnostic.startLine, diagnostic.endLine);
    const endLine = Math.max(diagnostic.startLine, diagnostic.endLine);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber += 1) {
      const lineDiagnostics = diagnosticsByLine.get(lineNumber);
      if (lineDiagnostics) {
        lineDiagnostics.push(diagnostic);
      } else {
        diagnosticsByLine.set(lineNumber, [diagnostic]);
      }
    }
  }

  return diagnosticsByLine;
}

export function findDiagnosticSeverityForToken(
  token: HTMLElement,
  diagnosticsByLine: Map<number, LspDiagnostic[]>,
): LspDiagnostic["severity"] | null {
  if (!tokenCanRenderDiagnostic(token)) {
    return null;
  }

  const lineNumber = getTokenLineNumber(token);
  if (!lineNumber) {
    return null;
  }

  const diagnostics = diagnosticsByLine.get(lineNumber);
  if (!diagnostics || diagnostics.length === 0) {
    return null;
  }

  const charRange = getTokenCharRange(token);
  if (!charRange) {
    return null;
  }

  let winningSeverity: LspDiagnostic["severity"] | null = null;
  let winningPriority = -1;
  for (const diagnostic of diagnostics) {
    if (!tokenOverlapsDiagnostic(lineNumber, charRange.start, charRange.end, diagnostic)) {
      continue;
    }

    const priority = DIAGNOSTIC_SEVERITY_PRIORITY[diagnostic.severity];
    if (priority > winningPriority) {
      winningPriority = priority;
      winningSeverity = diagnostic.severity;
    }
  }

  return winningSeverity;
}

export function findDiagnosticsForToken(
  token: HTMLElement,
  diagnosticsByLine: Map<number, LspDiagnostic[]>,
): LspDiagnostic[] {
  if (!tokenCanRenderDiagnostic(token)) {
    return [];
  }

  const lineNumber = getTokenLineNumber(token);
  if (!lineNumber) {
    return [];
  }

  const diagnostics = diagnosticsByLine.get(lineNumber);
  if (!diagnostics || diagnostics.length === 0) {
    return [];
  }

  const charRange = getTokenCharRange(token);
  if (!charRange) {
    return [];
  }

  const matches = diagnostics.filter((diagnostic) =>
    tokenOverlapsDiagnostic(lineNumber, charRange.start, charRange.end, diagnostic),
  );
  return matches.toSorted(
    (left, right) =>
      DIAGNOSTIC_SEVERITY_PRIORITY[right.severity] - DIAGNOSTIC_SEVERITY_PRIORITY[left.severity],
  );
}

export function readDiagnosticAnchorRect(tokenElement: HTMLElement): DiagnosticPopoverAnchorRect {
  const rect = tokenElement.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

// Applies diagnostic attributes with minimal DOM churn by updating only tokens
// whose severity changed and skipping lines that cannot render diagnostics.
export function applyDiagnosticTokenDecorations(
  rootNode: HTMLElement,
  diagnosticsByLine: Map<number, LspDiagnostic[]>,
) {
  const roots: ParentNode[] = [rootNode];
  if (rootNode.shadowRoot) {
    roots.unshift(rootNode.shadowRoot);
  }

  if (diagnosticsByLine.size === 0) {
    for (const root of roots) {
      const tokens = root.querySelectorAll<HTMLElement>("[data-lsp-diagnostic-token]");
      for (const token of tokens) {
        token.removeAttribute("data-lsp-diagnostic-token");
      }

      const lines = root.querySelectorAll<HTMLElement>("[data-lsp-diagnostic-line]");
      for (const line of lines) {
        line.removeAttribute("data-lsp-diagnostic-line");
      }
    }
    return;
  }

  for (const root of roots) {
    const lines = root.querySelectorAll<HTMLElement>("[data-line]");
    for (const line of lines) {
      const lineNumber = readLineNumber(line);
      if (!lineNumber) {
        continue;
      }

      const diagnostics = diagnosticsByLine.get(lineNumber);
      const canRender =
        diagnostics != null && diagnostics.length > 0 && lineCanRenderDiagnostic(line);
      if (!canRender) {
        line.removeAttribute("data-lsp-diagnostic-line");
        const markedTokens = line.querySelectorAll<HTMLElement>(
          "[data-char][data-lsp-diagnostic-token]",
        );
        for (const token of markedTokens) {
          token.removeAttribute("data-lsp-diagnostic-token");
        }
        continue;
      }

      const lineSeverity = getHighestDiagnosticSeverity(diagnostics);
      if (lineSeverity) {
        line.setAttribute("data-lsp-diagnostic-line", lineSeverity);
      } else {
        line.removeAttribute("data-lsp-diagnostic-line");
      }

      const tokens = line.querySelectorAll<HTMLElement>("[data-char]");
      for (const token of tokens) {
        const nextSeverity = getSeverityForTokenInLine(token, lineNumber, diagnostics);
        const currentSeverity = token.getAttribute("data-lsp-diagnostic-token");

        if (!nextSeverity) {
          if (currentSeverity !== null) {
            token.removeAttribute("data-lsp-diagnostic-token");
          }
          continue;
        }

        if (currentSeverity !== nextSeverity) {
          token.setAttribute("data-lsp-diagnostic-token", nextSeverity);
        }
      }
    }
  }
}

function getSeverityForTokenInLine(
  token: HTMLElement,
  lineNumber: number,
  diagnostics: LspDiagnostic[],
): LspDiagnostic["severity"] | null {
  const charRange = getTokenCharRange(token);
  if (!charRange) {
    return null;
  }

  let winningSeverity: LspDiagnostic["severity"] | null = null;
  let winningPriority = -1;
  for (const diagnostic of diagnostics) {
    if (!tokenOverlapsDiagnostic(lineNumber, charRange.start, charRange.end, diagnostic)) {
      continue;
    }

    const priority = DIAGNOSTIC_SEVERITY_PRIORITY[diagnostic.severity];
    if (priority > winningPriority) {
      winningPriority = priority;
      winningSeverity = diagnostic.severity;
    }
  }

  return winningSeverity;
}
