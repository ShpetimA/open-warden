import path from "node:path";

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".cjs": "javascript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".mts": "typescript",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
};

export function languageIdForPath(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  return LANGUAGE_BY_EXTENSION[extension] ?? null;
}
