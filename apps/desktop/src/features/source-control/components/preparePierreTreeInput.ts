import { prepareFileTreeInput, type FileTreeSortComparator } from "@pierre/trees";

export function preparePierreTreeInput(
  paths: readonly string[],
  options: { flattenEmptyDirectories?: boolean; sort?: "default" | FileTreeSortComparator },
  inlineEditor?: { path: string; anchorPath?: string },
) {
  const baseline = prepareFileTreeInput(paths, options);
  const orderedPaths = [...baseline.paths];
  if (inlineEditor) {
    const placeholderIndex = orderedPaths.indexOf(inlineEditor.path);
    if (placeholderIndex >= 0) orderedPaths.splice(placeholderIndex, 1);
    const anchorIndex = inlineEditor.anchorPath
      ? orderedPaths.indexOf(inlineEditor.anchorPath)
      : -1;
    const parent = inlineEditor.path.slice(0, inlineEditor.path.lastIndexOf("/") + 1);
    const firstChildIndex = parent ? orderedPaths.findIndex((path) => path.startsWith(parent)) : 0;
    const insertionIndex = anchorIndex >= 0 ? anchorIndex + 1 : Math.max(0, firstChildIndex);
    orderedPaths.splice(insertionIndex, 0, inlineEditor.path);
  }

  const ranks = new Map<string, number>();
  for (const path of orderedPaths) {
    const segments = path.split("/").filter((segment) => segment.length > 0);
    for (let depth = 1; depth <= segments.length; depth += 1) {
      const node = segments.slice(0, depth).join("/");
      if (!ranks.has(node)) ranks.set(node, ranks.size);
    }
  }
  const sort: FileTreeSortComparator = (left, right) => {
    const leftRank = ranks.get(left.path.replace(/\/$/, ""));
    const rightRank = ranks.get(right.path.replace(/\/$/, ""));
    if (leftRank === undefined || rightRank === undefined)
      return left.path.localeCompare(right.path);
    return leftRank - rightRank;
  };
  return {
    preparedInput: inlineEditor ? prepareFileTreeInput(paths, { ...options, sort }) : baseline,
    sort,
  };
}
