import type { LspDiagnostic } from "@/features/source-control/types";

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

  const lineType = lineElement.getAttribute("data-line-type");
  if (lineType === "change-deletion") {
    return false;
  }

  if (token.closest("[data-additions]")) {
    return true;
  }

  if (token.closest("[data-deletions]")) {
    return false;
  }

  return true;
}

function getTokenLineNumber(token: HTMLElement): number | null {
  const lineElement = token.closest<HTMLElement>("[data-line]");
  if (!lineElement) {
    return null;
  }

  const value = Number.parseInt(lineElement.getAttribute("data-line") ?? "", 10);
  return Number.isFinite(value) ? value : null;
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
  const rangeEndRaw = lineNumber === diagnostic.endLine ? diagnostic.endCharacter : Number.MAX_SAFE_INTEGER;
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

export function applyDiagnosticTokenDecorations(
  rootNode: HTMLElement,
  diagnosticsByLine: Map<number, LspDiagnostic[]>,
) {
  const roots: ParentNode[] = [rootNode];
  if (rootNode.shadowRoot) {
    roots.unshift(rootNode.shadowRoot);
  }

  const tokens = roots.flatMap((root) =>
    Array.from(root.querySelectorAll<HTMLElement>("[data-line] [data-char]")),
  );
  for (const token of tokens) {
    token.removeAttribute("data-lsp-diagnostic-token");
    const severity = findDiagnosticSeverityForToken(token, diagnosticsByLine);
    if (severity) {
      token.setAttribute("data-lsp-diagnostic-token", severity);
    }
  }
}
