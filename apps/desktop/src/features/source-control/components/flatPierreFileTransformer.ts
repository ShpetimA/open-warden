import { toFlatPierreLeafPath } from "./flatPierrePaths";

type FlatPierreFile = {
  path: string;
  realPath: string;
};

type BuildFlatPierreFileTransformArgs<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  selectedPath?: string;
  selectedPaths?: readonly string[];
};

type FlatPierreFileTransform<TFile extends { path: string }> = {
  flatFiles: FlatPierreFile[];
  fileByTreePath: Map<string, TFile>;
  pierreSelectedPath: string;
  pierreSelectedPaths: string[];
};

export function buildFlatPierreFileTransform<TFile extends { path: string }>({
  files,
  selectedPath = "",
  selectedPaths,
}: BuildFlatPierreFileTransformArgs<TFile>): FlatPierreFileTransform<TFile> {
  const sortedFiles = [...files].sort((left, right) =>
    left.path.localeCompare(right.path, undefined, { numeric: true, sensitivity: "base" }),
  );

  const flatFiles = sortedFiles.map((file, index) => ({
    path: toFlatPierreLeafPath(file.path, index),
    realPath: file.path,
  }));

  const fileByTreePath = new Map(flatFiles.map((file, index) => [file.path, sortedFiles[index]]));
  const treePathByRealPath = new Map(flatFiles.map((file) => [file.realPath, file.path]));

  const pierreSelectedPath = treePathByRealPath.get(selectedPath) ?? "";
  const pierreSelectedPaths = (selectedPaths ?? (selectedPath ? [selectedPath] : []))
    .map((path) => treePathByRealPath.get(path))
    .filter((path): path is string => !!path);

  return {
    flatFiles,
    fileByTreePath,
    pierreSelectedPath,
    pierreSelectedPaths,
  };
}
