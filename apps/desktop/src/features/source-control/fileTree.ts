export interface SourceControlTreeDirectoryNode<TFile> {
  kind: "directory";
  name: string;
  path: string;
  fileCount: number;
  children: SourceControlTreeNode<TFile>[];
}

export interface SourceControlTreeFileNode<TFile> {
  kind: "file";
  name: string;
  path: string;
  file: TFile;
}

export type SourceControlTreeNode<TFile> =
  | SourceControlTreeDirectoryNode<TFile>
  | SourceControlTreeFileNode<TFile>;

type MutableDirectoryNode<TFile> = {
  name: string;
  path: string;
  fileCount: number;
  directories: Map<string, MutableDirectoryNode<TFile>>;
  files: SourceControlTreeFileNode<TFile>[];
};

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

function normalizePathSegments(pathValue: string): string[] {
  return pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, SORT_LOCALE_OPTIONS);
}

function compactDirectoryNode<TFile>(
  node: SourceControlTreeDirectoryNode<TFile>,
): SourceControlTreeDirectoryNode<TFile> {
  const compactedChildren = node.children.map((child) =>
    child.kind === "directory" ? compactDirectoryNode(child) : child,
  );

  let compactedNode: SourceControlTreeDirectoryNode<TFile> = {
    ...node,
    children: compactedChildren,
  };

  while (compactedNode.children.length === 1 && compactedNode.children[0]?.kind === "directory") {
    const onlyChild = compactedNode.children[0];
    compactedNode = {
      kind: "directory",
      name: `${compactedNode.name}/${onlyChild.name}`,
      path: onlyChild.path,
      fileCount: onlyChild.fileCount,
      children: onlyChild.children,
    };
  }

  return compactedNode;
}

function toTreeNodes<TFile>(
  directory: MutableDirectoryNode<TFile>,
): SourceControlTreeNode<TFile>[] {
  const subdirectories: SourceControlTreeDirectoryNode<TFile>[] = [
    ...directory.directories.values(),
  ]
    .sort(compareByName)
    .map<SourceControlTreeDirectoryNode<TFile>>((subdirectory) => ({
      kind: "directory",
      name: subdirectory.name,
      path: subdirectory.path,
      fileCount: subdirectory.fileCount,
      children: toTreeNodes(subdirectory),
    }))
    .map((subdirectory) => compactDirectoryNode(subdirectory));

  const files = [...directory.files].sort(compareByName);
  return [...subdirectories, ...files];
}

export function buildSourceControlFileTree<TFile extends { path: string }>(
  files: ReadonlyArray<TFile>,
): SourceControlTreeNode<TFile>[] {
  const root: MutableDirectoryNode<TFile> = {
    name: "",
    path: "",
    fileCount: 0,
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const segments = normalizePathSegments(file.path);
    if (segments.length === 0) continue;

    const filePath = segments.join("/");
    const fileName = segments.at(-1);
    if (!fileName) continue;

    const ancestors: MutableDirectoryNode<TFile>[] = [root];
    let currentDirectory = root;

    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      const existing = currentDirectory.directories.get(segment);
      if (existing) {
        currentDirectory = existing;
      } else {
        const created: MutableDirectoryNode<TFile> = {
          name: segment,
          path: nextPath,
          fileCount: 0,
          directories: new Map(),
          files: [],
        };
        currentDirectory.directories.set(segment, created);
        currentDirectory = created;
      }
      ancestors.push(currentDirectory);
    }

    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: filePath,
      file,
    });

    for (const ancestor of ancestors) {
      ancestor.fileCount += 1;
    }
  }

  return toTreeNodes(root);
}

export function collectDirectoryPaths<TFile>(
  nodes: ReadonlyArray<SourceControlTreeNode<TFile>>,
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children));
  }
  return paths;
}
