import { AsyncQueuer } from "@tanstack/react-pacer";
import type { parseDiffFromFile } from "@pierre/diffs";

import type { DiffFile } from "@/features/source-control/types";

type ParsedDiff = ReturnType<typeof parseDiffFromFile>;
type ParseWorkerFile = DiffFile & { cacheKey?: string };
export type ParsePriority = "high" | "low";

type ParseResponseMessage =
  | {
      type: "parsed";
      requestId: number;
      data: ParsedDiff;
    }
  | {
      type: "error";
      requestId: number;
      message: string;
    };

type ParseTask = {
  requestId: number;
  oldFile: ParseWorkerFile;
  newFile: ParseWorkerFile;
  resolve: (value: ParsedDiff) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  aborted: boolean;
  priority: ParsePriority;
  onSignalAbort: () => void;
};

type ActiveParseTask = {
  task: ParseTask;
  resolveRun: () => void;
  rejectRun: (reason?: unknown) => void;
  cleanup: () => void;
};

let nextRequestId = 1;
let worker: Worker | null = null;
let activeParseTask: ActiveParseTask | null = null;

function priorityWeight(priority: ParsePriority): number {
  return priority === "high" ? 1 : 0;
}

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL("../workers/diff-parse.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.addEventListener("message", onWorkerMessage);
  worker.addEventListener("error", onWorkerError);
  return worker;
}

function recreateWorker() {
  if (!worker) return;

  worker.removeEventListener("message", onWorkerMessage);
  worker.removeEventListener("error", onWorkerError);
  worker.terminate();
  worker = null;
}

function cleanupTask(task: ParseTask) {
  task.signal?.removeEventListener("abort", task.onSignalAbort);
}

function toAbortError(): DOMException {
  return new DOMException("Aborted", "AbortError");
}

const parseTaskQueuer: AsyncQueuer<ParseTask> = new AsyncQueuer(runParseTask, {
  concurrency: 1,
  getPriority: (task) => priorityWeight(task.priority),
  onError: () => {},
  throwOnError: false,
});

function removePendingParseTask(requestId: number): boolean {
  const pendingTasks = parseTaskQueuer.peekPendingItems();
  if (pendingTasks.length === 0) return false;

  const nextPendingTasks = pendingTasks.filter((task) => task.requestId !== requestId);
  if (nextPendingTasks.length === pendingTasks.length) return false;

  parseTaskQueuer.clear();
  for (const task of nextPendingTasks) {
    parseTaskQueuer.addItem(task);
  }
  return true;
}

function interruptActiveParseTask() {
  if (!activeParseTask) return;
  parseTaskQueuer.abort();
}

function runParseTask(task: ParseTask): Promise<void> {
  if (task.aborted || task.signal?.aborted) {
    cleanupTask(task);
    return Promise.resolve();
  }

  return new Promise<void>((resolveRun, rejectRun) => {
    const queueAbortSignal = parseTaskQueuer.getAbortSignal();

    let settled = false;
    const cleanup = () => {
      queueAbortSignal?.removeEventListener("abort", onQueueAbort);
      cleanupTask(task);
      if (activeParseTask?.task.requestId === task.requestId) {
        activeParseTask = null;
      }
    };

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onQueueAbort = () => {
      task.aborted = true;
      const error = toAbortError();
      recreateWorker();
      finish(() => {
        task.reject(error);
        rejectRun(error);
      });
    };

    if (queueAbortSignal?.aborted) {
      onQueueAbort();
      return;
    }

    queueAbortSignal?.addEventListener("abort", onQueueAbort, { once: true });

    activeParseTask = {
      task,
      resolveRun: () => {
        finish(resolveRun);
      },
      rejectRun: (reason) => {
        finish(() => rejectRun(reason));
      },
      cleanup,
    };

    getWorker().postMessage({
      type: "parse",
      requestId: task.requestId,
      oldFile: task.oldFile,
      newFile: task.newFile,
    });
  });
}

function onWorkerMessage(event: MessageEvent<ParseResponseMessage>) {
  const message = event.data;
  const currentTask = activeParseTask;
  if (!currentTask || message.requestId !== currentTask.task.requestId) return;

  if (message.type === "parsed") {
    currentTask.task.resolve(message.data);
    currentTask.resolveRun();
    return;
  }

  const error = new Error(message.message);
  currentTask.task.reject(error);
  currentTask.rejectRun(error);
}

function onWorkerError(event: ErrorEvent) {
  const currentTask = activeParseTask;
  recreateWorker();
  if (!currentTask) return;

  const error = event.error instanceof Error ? event.error : new Error(event.message);
  currentTask.task.reject(error);
  currentTask.rejectRun(error);
}

export function parseDiffInWorker(
  oldFile: ParseWorkerFile,
  newFile: ParseWorkerFile,
  signal?: AbortSignal,
  priority: ParsePriority = "high",
): Promise<ParsedDiff> {
  const requestId = nextRequestId++;

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError());
      return;
    }

    const task: ParseTask = {
      requestId,
      oldFile,
      newFile,
      resolve,
      reject,
      signal,
      aborted: false,
      priority,
      onSignalAbort: () => {
        if (task.aborted) return;
        task.aborted = true;

        if (activeParseTask?.task.requestId === requestId) {
          interruptActiveParseTask();
          return;
        }

        const removedFromQueue = removePendingParseTask(requestId);
        if (removedFromQueue) {
          cleanupTask(task);
        }

        reject(toAbortError());
      },
    };

    signal?.addEventListener("abort", task.onSignalAbort, { once: true });

    if (priority === "high" && activeParseTask) {
      interruptActiveParseTask();
    }

    parseTaskQueuer.addItem(task);
  });
}
