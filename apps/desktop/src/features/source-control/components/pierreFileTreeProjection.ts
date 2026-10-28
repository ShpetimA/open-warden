import type { FileTree } from "@pierre/trees";

/** Prepared paths already contain Pierre's render order. Expansion is read live from its model. */
export function collectPreparedTreeRowPaths(
  orderedPaths: readonly string[],
  model: FileTree,
  flattenEmptyDirectories = false,
): string[] {
  const children = new Map<string, Set<string>>();
  const directoryPaths = new Set<string>();
  if (flattenEmptyDirectories) {
    for (const path of orderedPaths) {
      const segments = path.split("/");
      for (let depth = 1; depth < segments.length; depth += 1) {
        const directory = segments.slice(0, depth).join("/");
        const child = segments.slice(0, depth + 1).join("/");
        directoryPaths.add(directory);
        const entries = children.get(directory) ?? new Set<string>();
        entries.add(child);
        children.set(directory, entries);
      }
    }
  }

  const rows: string[] = [];
  const directories = new Set<string>();
  for (const path of orderedPaths) {
    const segments = path.split("/");
    let visible = true;
    for (let depth = 1; depth < segments.length; depth += 1) {
      const directory = segments.slice(0, depth).join("/");
      const entries = children.get(directory);
      const onlyChild = entries?.size === 1 ? entries.values().next().value : undefined;
      if (onlyChild && directoryPaths.has(onlyChild)) continue;

      if (!directories.has(directory)) {
        directories.add(directory);
        rows.push(directory);
      }
      const item = model.getItem(directory);
      if (item && "isExpanded" in item && !item.isExpanded()) {
        visible = false;
        break;
      }
    }
    if (visible) rows.push(path);
  }
  return rows;
}
