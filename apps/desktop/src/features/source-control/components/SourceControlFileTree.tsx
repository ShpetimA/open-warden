import { ChevronRight, FolderClosed, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import {
  buildSourceControlFileTree,
  collectDirectoryPaths,
  type SourceControlTreeNode,
} from "@/features/source-control/fileTree";

type RenderFileArgs<TFile> = {
  depth: number;
  file: TFile;
  name: string;
  navIndex: number;
  path: string;
};

type SourceControlFileTreeProps<TFile extends { path: string }> = {
  files: ReadonlyArray<TFile>;
  className?: string;
  emptyState?: ReactNode;
  renderFile: (args: RenderFileArgs<TFile>) => ReactNode;
};

export function SourceControlFileTree<TFile extends { path: string }>({
  files,
  className,
  emptyState = null,
  renderFile,
}: SourceControlFileTreeProps<TFile>) {
  const treeNodes = useMemo(() => buildSourceControlFileTree(files), [files]);
  const directoryPathsKey = useMemo(() => collectDirectoryPaths(treeNodes).join("\u0000"), [treeNodes]);
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>(() =>
    buildDirectoryExpansionState(directoryPathsKey ? directoryPathsKey.split("\u0000") : [], true),
  );

  useEffect(() => {
    setExpandedDirectories((current) => {
      const next = buildDirectoryExpansionState(
        directoryPathsKey ? directoryPathsKey.split("\u0000") : [],
        true,
      );
      for (const [path, expanded] of Object.entries(current)) {
        if (path in next) {
          next[path] = expanded;
        }
      }
      return next;
    });
  }, [directoryPathsKey]);

  const toggleDirectory = useCallback((pathValue: string) => {
    setExpandedDirectories((current) => ({
      ...current,
      [pathValue]: !(current[pathValue] ?? true),
    }));
  }, []);

  let visibleFileIndex = 0;

  const renderTreeNode = (node: SourceControlTreeNode<TFile>, depth: number): ReactNode => {
    const leftPadding = 8 + depth * 14;

    if (node.kind === "directory") {
      const isExpanded = expandedDirectories[node.path] ?? true;

      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className="text-foreground/80 hover:bg-accent/60 group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-xs"
            style={{ paddingLeft: `${leftPadding}px` }}
            onClick={() => toggleDirectory(node.path)}
            title={node.path}
          >
            <ChevronRight
              className={`text-muted-foreground size-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            />
            {isExpanded ? (
              <FolderOpen className="text-muted-foreground size-3.5 shrink-0" />
            ) : (
              <FolderClosed className="text-muted-foreground size-3.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            <span className="text-muted-foreground shrink-0 text-[10px]">{node.fileCount}</span>
          </button>
          {isExpanded ? (
            <div className="space-y-0.5">
              {node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}
            </div>
          ) : null}
        </div>
      );
    }

    const navIndex = visibleFileIndex;
    visibleFileIndex += 1;
    return renderFile({
      depth,
      file: node.file,
      name: node.name,
      navIndex,
      path: node.path,
    });
  };

  if (treeNodes.length === 0) {
    return <>{emptyState}</>;
  }

  return <div className={className}>{treeNodes.map((node) => renderTreeNode(node, 0))}</div>;
}

function buildDirectoryExpansionState(
  directoryPaths: ReadonlyArray<string>,
  expanded: boolean,
): Record<string, boolean> {
  const expandedState: Record<string, boolean> = {};
  for (const directoryPath of directoryPaths) {
    expandedState[directoryPath] = expanded;
  }
  return expandedState;
}
