import { AlertCircle, LoaderCircle, Search, TriangleAlert } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { selectLspFileStateForFile } from "@/features/lsp/selectors";

type Props = {
  repoPath: string;
  relPath: string;
  active: boolean;
};

function diagnosticsLabel(count: number) {
  return `${count} diagnostic${count === 1 ? "" : "s"}`;
}

export function LspStatusNotice({ repoPath, relPath, active }: Props) {
  const fileState = useAppSelector((state) => {
    if (!repoPath || !relPath) {
      return undefined;
    }

    return selectLspFileStateForFile(state, repoPath, relPath);
  });

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
    </div>
  );
}
