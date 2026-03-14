import { existsSync } from "node:fs";
import path from "node:path";

export function resolvePreloadPath(dirname: string) {
  const cjsPath = path.join(dirname, "preload.cjs");
  if (existsSync(cjsPath)) {
    return cjsPath;
  }

  return path.join(dirname, "preload.js");
}
