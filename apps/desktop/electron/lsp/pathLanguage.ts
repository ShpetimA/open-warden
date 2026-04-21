import path from "node:path";

import type { AppSettings } from "../../src/platform/desktop/contracts";

const DEFAULT_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".cjs": "javascript",
  ".cts": "typescript",
  ".js": "javascript",
  ".jsx": "javascriptreact",
  ".mjs": "javascript",
  ".mts": "typescript",
  ".ts": "typescript",
  ".tsx": "typescriptreact",
  ".py": "python",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".hh": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".java": "java",
  ".lua": "lua",
  ".rb": "ruby",
  ".php": "php",
  ".cs": "csharp",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".sc": "scala",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".md": "markdown",
  ".markdown": "markdown",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".dockerfile": "dockerfile",
};

const DEFAULT_LANGUAGE_BY_FILENAME: Record<string, string> = {
  dockerfile: "dockerfile",
};

function normalizeExtension(extension: string): string | null {
  const trimmed = extension.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith(".") ? trimmed : `.${trimmed}`;
}

function resolveLanguageByExtension(
  servers?: AppSettings["lsp"]["servers"],
): Record<string, string> {
  if (!servers) {
    return DEFAULT_LANGUAGE_BY_EXTENSION;
  }

  const merged = { ...DEFAULT_LANGUAGE_BY_EXTENSION };
  for (const [languageId, server] of Object.entries(servers)) {
    const extensions = server.extensions ?? [];
    for (const extension of extensions) {
      const normalized = normalizeExtension(extension);
      if (!normalized) {
        continue;
      }

      merged[normalized] = languageId;
    }
  }

  return merged;
}

export function languageIdForPath(
  filePath: string,
  servers?: AppSettings["lsp"]["servers"],
): string | null {
  const extension = path.extname(filePath).toLowerCase();
  const languageByExtension = resolveLanguageByExtension(servers);

  if (extension) {
    return languageByExtension[extension] ?? null;
  }

  const baseName = path.basename(filePath).toLowerCase();
  return DEFAULT_LANGUAGE_BY_FILENAME[baseName] ?? null;
}
