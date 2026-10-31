export function filterFilePaths<T extends { path: string; previousPath?: string | null }>(
  files: readonly T[],
  filter: string,
): readonly T[] {
  const query = filter.trim().toLowerCase();
  if (!query) return files;

  return files.filter(
    (file) =>
      file.path.toLowerCase().includes(query) || file.previousPath?.toLowerCase().includes(query),
  );
}

export function filePaneCount(visible: number, total: number) {
  const count = visible === total ? String(total) : `${visible}/${total}`;
  return `${count} ${total === 1 ? "file" : "files"}`;
}
