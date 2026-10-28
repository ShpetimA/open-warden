import type { FileTree } from "@pierre/trees";

/** Prepared paths already contain Pierre's render order. Expansion is read live from its model. */
export function collectPreparedTreeRowPaths(
  orderedPaths: readonly string[],
  model: FileTree,
): string[] {
  const rows: string[] = [];
  const directories = new Set<string>();
  for (const path of orderedPaths) {
    const segments = path.split("/");
    let visible = true;
    for (let depth = 1; depth < segments.length; depth += 1) {
      const directory = segments.slice(0, depth).join("/");
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
