import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useState, type ReactNode } from "react";

import { getDiffTheme } from "@/features/diff-view/diffRenderConfig";

import { getDiffWorkerPoolConfig } from "./diffWorkerPoolConfig";

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const [poolConfig] = useState(() =>
    getDiffWorkerPoolConfig(typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency),
  );

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        ...poolConfig,
      }}
      highlighterOptions={{
        preferredHighlighter: "highlights",
        theme: getDiffTheme(),
        useTokenTransformer: true,
        tokenizeMaxLineLength: 1_000,
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
