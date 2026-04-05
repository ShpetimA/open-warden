import { AlertCircle, Copy, LoaderCircle, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { useAppSelector } from "@/app/hooks";
import { selectLspFileStateForFile } from "@/features/lsp/selectors";
import type { LspDiagnostic } from "@/platform/desktop";

type Props = {
  repoPath: string;
  relPath: string;
  active: boolean;
};

function diagnosticsLabel(count: number) {
  return `${count} diagnostic${count === 1 ? "" : "s"}`;
}

function diagnosticMetadataLabel(diagnostic: LspDiagnostic) {
  const metadata = [diagnostic.source, diagnostic.code].filter(Boolean).join(" ");
  return metadata ? ` (${metadata})` : "";
}

function formatDiagnostic(diagnostic: LspDiagnostic, index: number) {
  return `${index + 1}. [${diagnostic.severity.toUpperCase()}] ${diagnostic.startLine}:${diagnostic.startCharacter}-${diagnostic.endLine}:${diagnostic.endCharacter} ${diagnostic.message}${diagnosticMetadataLabel(diagnostic)}`;
}

function formatDiagnosticsForClipboard(relPath: string, diagnostics: LspDiagnostic[]) {
  const lines = diagnostics.map((diagnostic, index) => formatDiagnostic(diagnostic, index));
  return [`Diagnostics for ${relPath}`, ...lines].join("\n");
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return String(error);
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
      toast.error("Failed to copy diagnostics", { description: errorMessage(error) });
    }
  };

  if (!active) {
    return null;
  }

  if (!fileState) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        <span>Checking diagnostics…</span>
      </div>
    );
  }

  if (fileState.reason) {
    return (
      <div className="border-border/70 bg-destructive/8 text-destructive flex items-center gap-2 border-b px-3 py-2 text-xs">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Diagnostics unavailable: {fileState.reason}</span>
      </div>
    );
  }

  if (fileState.diagnostics.length === 0) {
    return (
      <div className="text-muted-foreground border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span>No diagnostics reported.</span>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-surface-alt flex items-center gap-2 border-b px-3 py-2 text-xs">
      <AlertCircle className="text-amber-600 dark:text-amber-300 h-3.5 w-3.5 shrink-0" />
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
