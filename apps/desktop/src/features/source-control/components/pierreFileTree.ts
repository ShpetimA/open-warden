import type { PierreFileTreeBrowserFile } from "@/features/source-control/components/PierreFileTreeBrowser";
import type { BuildSourceControlFileTreeOptions } from "@/features/source-control/fileTree";
import type { FileTreeSortComparator } from "@pierre/trees";

function toPierreSortEntry(path: string, basename: string, isDirectory: boolean) {
  const segments = path.split("/").filter(Boolean);
  return {
    basename,
    depth: Math.max(0, segments.length - 1),
    isDirectory,
    path,
    segments,
  };
}

export function buildTreeOptions<TFile extends PierreFileTreeBrowserFile>(
  compareTreeDirectories: BuildSourceControlFileTreeOptions<TFile>["compareDirectories"],
  flattenEmptyDirectories: boolean,
  sort: "default" | FileTreeSortComparator,
): BuildSourceControlFileTreeOptions<TFile> {
  return {
    compareDirectories: compareTreeDirectories,
    compareFiles:
      sort === "default"
        ? undefined
        : (left, right) =>
            sort(
              toPierreSortEntry(left.path, left.name, false),
              toPierreSortEntry(right.path, right.name, false),
            ),
    flattenEmptyDirectories,
  };
}
