import { spawn } from "node:child_process";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

const activeChildren = new Set<ReturnType<typeof spawn>>();

function terminate(child: ReturnType<typeof spawn>) {
  return new Promise<void>((resolve) => {
    const done = () => resolve();
    child.once("exit", done);
    child.kill("SIGINT");
    setTimeout(() => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 2_000);
  });
}

afterEach(async () => {
  await Promise.all(
    [...activeChildren].map(async (child) => {
      activeChildren.delete(child);
      await terminate(child);
    }),
  );
});

test.runIf(process.platform === "darwin")(
  "electron forge dev shell boots successfully",
  { timeout: 45_000 },
  async () => {
    const appDir = path.resolve(import.meta.dirname, "..");
    const child = spawn("pnpm", ["dev:electron"], {
      cwd: appDir,
      env: {
        ...process.env,
        CI: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    activeChildren.add(child);

    let output = "";

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for Electron to boot.\n\n${output}`));
      }, 45_000);

      const onData = (chunk: Buffer | string) => {
        output += chunk.toString();
        if (output.includes("Launched Electron app")) {
          clearTimeout(timer);
          resolve();
        }
      };

      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`Electron dev shell exited early with code ${code}.\n\n${output}`));
      });
    });

    expect(output).toContain("Launched Electron app");

    activeChildren.delete(child);
    await terminate(child);
  },
);
