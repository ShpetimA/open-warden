import type { FileTree } from "@pierre/trees";

type ProjectionNode = {
  path: string;
  children: Map<string, ProjectionNode> | null;
};

type ProjectionRow = {
  path: string;
  subtreeEnd: number;
  isExpanded: (() => boolean) | null;
};

export type PreparedTreeProjection = {
  getVisiblePaths(): string[];
};

/** Structure and path handles belong to the prepared input; only expansion is read during navigation. */
export function createPreparedTreeProjection(
  orderedPaths: readonly string[],
  model: Pick<FileTree, "getItem">,
  flattenEmptyDirectories = false,
): PreparedTreeProjection {
  const roots = new Map<string, ProjectionNode>();
  for (const path of orderedPaths) {
    const segments = path.split("/").filter((segment) => segment.length > 0);
    let siblings = roots;
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const nodePath = segments.slice(0, depth).join("/");
      let node = siblings.get(nodePath);
      if (!node) {
        node = {
          path: nodePath,
          children: depth < segments.length || path.endsWith("/") ? new Map() : null,
        };
        siblings.set(nodePath, node);
      }
      if (node.children) siblings = node.children;
    }
  }

  const rows: ProjectionRow[] = [];
  function append(node: ProjectionNode) {
    if (flattenEmptyDirectories && node.children?.size === 1) {
      const child = node.children.values().next().value;
      if (child?.children) {
        append(child);
        return;
      }
    }

    const item = node.children ? model.getItem(node.path) : null;
    const row: ProjectionRow = {
      path: node.path,
      subtreeEnd: rows.length + 1,
      isExpanded: item && "isExpanded" in item ? () => item.isExpanded() : null,
    };
    rows.push(row);
    if (node.children) {
      for (const child of node.children.values()) append(child);
      row.subtreeEnd = rows.length;
    }
  }
  for (const root of roots.values()) append(root);

  return {
    getVisiblePaths() {
      const visible: string[] = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        if (!row) continue;
        visible.push(row.path);
        if (row.isExpanded && !row.isExpanded()) index = row.subtreeEnd - 1;
      }
      return visible;
    },
  };
}

export function preparedFileAfterRemoval(
  visiblePaths: readonly string[],
  activePath: string,
  remainingPaths: ReadonlySet<string>,
) {
  const index = visiblePaths.indexOf(activePath);
  if (index < 0) return null;
  for (let next = index + 1; next < visiblePaths.length; next += 1) {
    const path = visiblePaths[next];
    if (path && remainingPaths.has(path)) return path;
  }
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    const path = visiblePaths[previous];
    if (path && remainingPaths.has(path)) return path;
  }
  return null;
}
