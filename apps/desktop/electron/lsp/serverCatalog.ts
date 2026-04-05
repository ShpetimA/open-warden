import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

import type { AppSettings } from "../../src/platform/desktop/contracts";

type LanguageServerConfig = {
  command: string;
  args: string[];
};

type LanguageServerCandidate = {
  command: string;
  args: string[];
};

const execFile = promisify(nodeExecFile);

const DEFAULT_CANDIDATES_BY_LANGUAGE: Record<string, LanguageServerCandidate[]> = {
  javascript: [{ command: "typescript-language-server", args: ["--stdio"] }],
  javascriptreact: [{ command: "typescript-language-server", args: ["--stdio"] }],
  typescript: [{ command: "typescript-language-server", args: ["--stdio"] }],
  typescriptreact: [{ command: "typescript-language-server", args: ["--stdio"] }],
  python: [
    { command: "pyright-langserver", args: ["--stdio"] },
    { command: "pylsp", args: [] },
  ],
  go: [{ command: "gopls", args: [] }],
  rust: [{ command: "rust-analyzer", args: [] }],
  c: [{ command: "clangd", args: [] }],
  cpp: [{ command: "clangd", args: [] }],
  java: [{ command: "jdtls", args: [] }],
  lua: [{ command: "lua-language-server", args: [] }],
  ruby: [{ command: "solargraph", args: ["stdio"] }],
  php: [{ command: "phpactor", args: ["language-server"] }],
  csharp: [{ command: "omnisharp", args: ["-lsp"] }],
  swift: [{ command: "sourcekit-lsp", args: [] }],
  kotlin: [{ command: "kotlin-language-server", args: [] }],
  scala: [{ command: "metals", args: [] }],
  yaml: [{ command: "yaml-language-server", args: ["--stdio"] }],
  json: [{ command: "vscode-json-language-server", args: ["--stdio"] }],
  html: [{ command: "vscode-html-language-server", args: ["--stdio"] }],
  css: [{ command: "vscode-css-language-server", args: ["--stdio"] }],
  markdown: [{ command: "marksman", args: ["server"] }],
  bash: [{ command: "bash-language-server", args: ["start"] }],
  dockerfile: [{ command: "docker-langserver", args: ["--stdio"] }],
  eslint: [{ command: "vscode-eslint-language-server", args: ["--stdio"] }],
};

async function findCommandOnPath(command: string): Promise<string | null> {
  const lookupCommand = process.platform === "win32" ? "where" : "which";

  try {
    const { stdout } = await execFile(lookupCommand, [command]);
    const firstResult = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0);
    return firstResult ?? null;
  } catch {
    return null;
  }
}

function resolveUserOverride(
  languageId: string,
  settings: AppSettings | null | undefined,
): LanguageServerConfig | null {
  const override = settings?.lsp?.servers?.[languageId];
  if (!override) {
    return null;
  }

  const command = override.command.trim();
  if (command.length === 0) {
    return null;
  }

  return {
    command,
    args: override.args,
  };
}

async function resolveFirstAvailableCandidate(
  candidates: LanguageServerCandidate[],
): Promise<LanguageServerConfig | null> {
  for (const candidate of candidates) {
    const resolvedCommand = await findCommandOnPath(candidate.command);
    if (!resolvedCommand) {
      continue;
    }

    return {
      command: resolvedCommand,
      args: candidate.args,
    };
  }

  return null;
}

export async function resolveServerConfigForLanguage(
  languageId: string,
  settings?: AppSettings | null,
): Promise<LanguageServerConfig | null> {
  const userOverride = resolveUserOverride(languageId, settings);
  if (userOverride) {
    return userOverride;
  }

  const defaultCandidates = DEFAULT_CANDIDATES_BY_LANGUAGE[languageId];
  if (defaultCandidates) {
    const resolvedDefault = await resolveFirstAvailableCandidate(defaultCandidates);
    if (resolvedDefault) {
      return resolvedDefault;
    }
  }

  return null;
}
