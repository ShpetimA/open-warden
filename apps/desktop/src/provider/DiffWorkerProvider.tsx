import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useMemo, type ReactNode } from "react";

import { getDiffWorkerPoolConfig } from "./diffWorkerPoolConfig";

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const poolConfig = useMemo(
    () =>
      getDiffWorkerPoolConfig(typeof navigator === "undefined" ? 0 : navigator.hardwareConcurrency),
    [],
  );

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        ...poolConfig,
      }}
      highlighterOptions={{
        useTokenTransformer: true,
        tokenizeMaxLineLength: 1_000,
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
