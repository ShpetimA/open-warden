import { stripVTControlCharacters } from "node:util";

export function sanitizeGitCommandOutput(output: string, environment: NodeJS.ProcessEnv) {
  let safe = stripVTControlCharacters(output);

  for (const [name, value] of Object.entries(environment)) {
    if (
      value &&
      value.length >= 6 &&
      /token|password|secret|authorization|private_key/i.test(name)
    ) {
      safe = safe.split(value).join("[redacted]");
    }
  }

  return safe
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[remote]")
    .replace(/\b(Basic|Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(?:gh[pousr]_|github_pat_|ATBB)[A-Za-z0-9_=-]+/g, "[redacted]")
    .replace(/\b(token|password|secret|api[_-]?key)(\s*[:=]\s*)(["']?)[^\s"']+/gi, "$1$2[redacted]")
    .trim()
    .slice(-16000);
}
