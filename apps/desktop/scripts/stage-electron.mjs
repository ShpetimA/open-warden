import { execFileSync } from "node:child_process";
import { access, cp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL("..", import.meta.url));
const workspaceDirectory = path.resolve(appDirectory, "../..");
const stageDirectory = path.join(appDirectory, ".vite/package");
const pnpmCli = process.env.npm_execpath;

if (!pnpmCli) {
  throw new Error("Run this script with pnpm stage:electron.");
}

for (const file of ["dist/index.html", ".vite/build/main.cjs", ".vite/build/preload.cjs"]) {
  await access(path.join(appDirectory, file));
}

await rm(stageDirectory, { recursive: true, force: true });

execFileSync(
  process.execPath,
  [
    pnpmCli,
    "--config.inject-workspace-packages=true",
    "--filter",
    "desktop",
    "deploy",
    "--prod",
    stageDirectory,
  ],
  { cwd: workspaceDirectory, stdio: "inherit" },
);

for (const directory of ["dist", ".vite/build"]) {
  await cp(path.join(appDirectory, directory), path.join(stageDirectory, directory), {
    recursive: true,
  });
}

// Keep dependency discovery inside the deployed app instead of the parent workspace.
await writeFile(path.join(stageDirectory, "pnpm-workspace.yaml"), 'packages:\n  - "."\n');
