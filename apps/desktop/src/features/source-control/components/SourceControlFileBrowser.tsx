import { useMemo, type ReactNode } from "react";

import type { FileBrowserMode } from "@/features/source-control/types";
import { SourceControlFileTree } from "./SourceControlFileTree";

type RenderFileArgs<TFile> = {
  depth: number;
  file: TFile;
  mode: FileBrowserMode;
  name: string;
  navIndex: number;
  path: string;
};

type SourceControlFileBrowserProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  mode: FileBrowserMode;
  className?: string;
  emptyState?: ReactNode;
  renderFile: (args: RenderFileArgs<TFile>) => ReactNode;
};

export function SourceControlFileBrowser<TFile extends { path: string }>({
  files,
  mode,
  className,
  emptyState = null,
  renderFile,
}: SourceControlFileBrowserProps<TFile>) {
  const flatRows = useMemo(() => buildFlatRows(files), [files]);

  if (files.length === 0) {
    return <>{emptyState}</>;
  }

  if (mode === "list") {
    return (
      <div className={className}>
        {flatRows.map((row, index) =>
          renderFile({
            depth: 0,
            file: row.file,
            mode,
            name: row.name,
            navIndex: index,
            path: row.path,
          }),
        )}
      </div>
    );
  }

  return (
    <SourceControlFileTree
      files={files}
      className={className}
      emptyState={emptyState}
      renderFile={({ depth, file, name, navIndex, path }) =>
        renderFile({
          depth,
          file,
          mode,
          name,
          navIndex,
          path,
        })
      }
    />
  );
}

function buildFlatRows<TFile extends { path: string }>(files: ReadonlyArray<TFile>) {
  const rows = files.map((file) => ({
    file,
    path: normalizePath(file.path),
    name: leafName(file.path),
  }));

  rows.sort((a, b) =>
    a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" }),
  );
  return rows;
}

function normalizePath(pathValue: string): string {
  return pathValue.replaceAll("\\", "/").replace(/^\/+/, "");
}

function leafName(pathValue: string): string {
  const normalized = normalizePath(pathValue);
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}
