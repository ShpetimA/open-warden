import { spawn } from "node:child_process";
import { watch } from "node:fs";
import path from "node:path";
import process from "node:process";

import electronBinary from "electron";
import waitOn from "wait-on";

const appDir = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(appDir, ".vite", "build");
const watchedFiles = new Set(["main.cjs", "preload.cjs"]);

let child = null;
let restarting = false;
let shuttingDown = false;
let restartTimer = null;

function log(message) {
  process.stdout.write(`[dev-electron] ${message}\n`);
}

function spawnElectron() {
  const childEnv = { ...process.env };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const nextChild = spawn(electronBinary, ["."], {
    cwd: appDir,
    env: {
      ...childEnv,
      VITE_DEV_SERVER_URL: "http://localhost:1420",
    },
    stdio: "inherit",
  });

  child = nextChild;
  log("Launched Electron app");

  nextChild.once("exit", (code, signal) => {
    if (child === nextChild) {
      child = null;
    }

    if (shuttingDown || restarting) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    log(`Electron exited (${reason})`);
    process.exit(code ?? 0);
  });
}

function killElectron() {
  return new Promise((resolve) => {
    if (!child) {
      resolve();
      return;
    }

    const activeChild = child;
    child = null;

    activeChild.once("exit", () => {
      resolve();
    });

    activeChild.kill("SIGTERM");

    setTimeout(() => {
      if (activeChild.exitCode === null && activeChild.signalCode === null) {
        activeChild.kill("SIGKILL");
      }
    }, 2_000).unref();
  });
}

function scheduleRestart() {
  if (restarting || shuttingDown) {
    return;
  }

  restarting = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
  }

  restartTimer = setTimeout(async () => {
    restartTimer = null;
    await killElectron();
    spawnElectron();
    restarting = false;
  }, 150);
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  await killElectron();
  process.exit(exitCode);
}

log("Waiting for renderer and Electron bundles");

await waitOn({
  resources: [
    "tcp:1420",
    `file:${path.join(buildDir, "main.cjs")}`,
    `file:${path.join(buildDir, "preload.cjs")}`,
  ],
});

log("Renderer and Electron bundles are ready");
spawnElectron();

const watcher = watch(buildDir, (_eventType, fileName) => {
  if (!fileName || !watchedFiles.has(fileName.toString())) {
    return;
  }

  log(`Detected ${fileName} change, restarting Electron`);
  scheduleRestart();
});

process.on("SIGINT", async () => {
  watcher.close();
  await shutdown(0);
});

process.on("SIGTERM", async () => {
  watcher.close();
  await shutdown(0);
});
