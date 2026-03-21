import { createRequire } from "node:module";

type LanguageServerConfig = {
  command: string;
  args: string[];
};

const require = createRequire(import.meta.url);
const TYPESCRIPT_LANGUAGE_SERVER_CLI = require.resolve("typescript-language-server/lib/cli.mjs");

const TYPESCRIPT_SERVER: LanguageServerConfig = {
  command: process.execPath,
  args: [TYPESCRIPT_LANGUAGE_SERVER_CLI, "--stdio"],
};

export function serverConfigForLanguage(languageId: string): LanguageServerConfig | null {
  switch (languageId) {
    case "javascript":
    case "javascriptreact":
    case "typescript":
    case "typescriptreact":
      return TYPESCRIPT_SERVER;
    default:
      return null;
  }
}
