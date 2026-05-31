import { AlertCircle, Copy, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { shallowEqual } from "react-redux";

import { useAppSelector } from "@/app/hooks";
import { selectLspFileStateForFile } from "@/features/lsp/selectors";
import { formatRange } from "@/features/source-control/utils";
import type { LspDiagnostic } from "@/platform/desktop";

type Props = {
  repoPath: string;
  relPath: string;
  active: boolean;
};

type LspDiagnosticsDocument = {
  repoPath: string;
  relPath: string;
};

type SummaryProps = {
  documents: LspDiagnosticsDocument[];
  active: boolean;
  isLoading?: boolean;
};

function diagnosticsLabel(count: number) {
  return `${count} diagnostic${count === 1 ? "" : "s"}`;
}

function diagnosticMetadataLabel(diagnostic: LspDiagnostic) {
  const metadata = [diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
  return metadata ? ` (${metadata})` : "";
}

function formatDiagnostic(relPath: string, diagnostic: LspDiagnostic) {
  return `@${relPath}#${formatRange(diagnostic.startLine, diagnostic.endLine)} - [${diagnostic.severity.toUpperCase()}] ${diagnostic.message}${diagnosticMetadataLabel(diagnostic)}`;
}

function formatDiagnosticsForClipboard(relPath: string, diagnostics: LspDiagnostic[]) {
  return diagnostics.map((diagnostic) => formatDiagnostic(relPath, diagnostic)).join("\n");
}

function formatAllDiagnosticsForClipboard(
  entries: { relPath: string; diagnostics: LspDiagnostic[] }[],
) {
  return entries
    .flatMap((entry) =>
      entry.diagnostics.map((diagnostic) => formatDiagnostic(entry.relPath, diagnostic)),
    )
    .join("\n");
}

function diagnosticsSummaryLabel(count: number, fileCount: number) {
  const problemLabel = `${count} problem${count === 1 ? "" : "s"}`;
  const fileLabel = `${fileCount} file${fileCount === 1 ? "" : "s"}`;
  return `${problemLabel} reported across ${fileLabel}.`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
}

export function LspDiagnosticsSummaryNotice({
  documents,
  active,
  isLoading = false,
}: SummaryProps) {
  const fileStates = useAppSelector(
    (state) =>
      documents.map((document) =>
        selectLspFileStateForFile(state, document.repoPath, document.relPath),
      ),
    shallowEqual,
  );

  const diagnosticEntries = documents
    .map((document, index) => ({
      relPath: document.relPath,
      diagnostics: fileStates[index]?.reason ? [] : (fileStates[index]?.diagnostics ?? []),
    }))
    .filter((entry) => entry.diagnostics.length > 0);
  const diagnosticsCount = diagnosticEntries.reduce(
    (count, entry) => count + entry.diagnostics.length,
    0,
  );
  const diagnosticFileCount = diagnosticEntries.length;
  const pendingCount = fileStates.filter((fileState) => !fileState).length;
  const unavailableCount = fileStates.filter((fileState) => fileState?.reason).length;

  const copyDiagnostics = async () => {
    if (diagnosticEntries.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatAllDiagnosticsForClipboard(diagnosticEntries));
      toast.success("Diagnostics copied");
    } catch (error) {
      toast.error("Failed to copy diagnostics", {
        description: errorMessage(error),
      });
    }
  };

  if (!active) {
    return null;
  }

  if (diagnosticsCount === 0 && (isLoading || (documents.length > 0 && pendingCount > 0))) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        </div>
        <span>Checking diagnostics…</span>
      </div>
    );
  }

  if (diagnosticsCount === 0 && unavailableCount > 0) {
    return (
      <div className="border-border/70 bg-destructive/8 text-destructive flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        </div>
        <span className="truncate">
          Diagnostics unavailable for {unavailableCount} file
          {unavailableCount === 1 ? "" : "s"}.
        </span>
      </div>
    );
  }

  if (diagnosticsCount === 0) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <Search className="h-3.5 w-3.5 shrink-0" />
        </div>
        <span>No problems reported.</span>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
      <div className="h-5 flex items-center">
        <AlertCircle className="text-amber-600 dark:text-amber-300 h-3.5 w-3.5 shrink-0" />
      </div>
      <span>
        {diagnosticsSummaryLabel(diagnosticsCount, diagnosticFileCount)}
        {isLoading || pendingCount > 0 ? " Checking remaining files…" : null}
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-accent/60 ml-auto inline-flex h-5 w-5 items-center justify-center rounded-sm"
        aria-label="Copy all diagnostics"
        title="Copy all diagnostics"
        onClick={() => {
          void copyDiagnostics();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function LspStatusNotice({ repoPath, relPath, active }: Props) {
  const fileState = useAppSelector((state) => {
    if (!repoPath || !relPath) {
      return undefined;
    }

    return selectLspFileStateForFile(state, repoPath, relPath);
  });
  const diagnostics = fileState?.diagnostics ?? [];

  const copyDiagnostics = async () => {
    if (diagnostics.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(formatDiagnosticsForClipboard(relPath, diagnostics));
      toast.success("Diagnostics copied");
    } catch (error) {
      toast.error("Failed to copy diagnostics", {
        description: errorMessage(error),
      });
    }
  };

  if (!active) {
    return null;
  }

  if (!fileState) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        </div>
        <span>Checking diagnostics…</span>
      </div>
    );
  }

  if (fileState.reason) {
    return (
      <div className="border-border/70 bg-destructive/8 text-destructive flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        </div>
        <span className="truncate">Diagnostics unavailable: {fileState.reason}</span>
      </div>
    );
  }

  if (fileState.diagnostics.length === 0) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <div className="h-5 flex items-center">
          <Search className="h-3.5 w-3.5 shrink-0" />
        </div>
        <span>No diagnostics reported.</span>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
      <div className="h-5 flex items-center">
        <AlertCircle className="text-amber-600 dark:text-amber-300 h-3.5 w-3.5 shrink-0" />
      </div>
      <span>{diagnosticsLabel(fileState.diagnostics.length)} reported.</span>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground hover:bg-accent/60 ml-auto inline-flex h-5 w-5 items-center justify-center rounded-sm"
        aria-label="Copy diagnostics"
        title="Copy diagnostics"
        onClick={() => {
          void copyDiagnostics();
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
