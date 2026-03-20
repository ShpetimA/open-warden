import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import { PacerProvider } from "@tanstack/react-pacer";
import "./index.css";
import App from "./App.tsx";
import { store } from "./app/store";
import { DesktopUpdateBootstrap } from "./features/desktop-update/DesktopUpdateBootstrap";
import { WorkspaceSessionBootstrap } from "./features/source-control/WorkspaceSessionBootstrap";
import { workerFactory } from "./lib/diffs-worker";

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <DesktopUpdateBootstrap />
    <PacerProvider
      defaultOptions={{
        asyncQueuer: {
          concurrency: 1,
          started: true,
        },
        throttler: {
          leading: true,
          trailing: true,
        },
      }}
    >
      <WorkerPoolContextProvider
        poolOptions={{
          workerFactory,
          poolSize: 4,
          totalASTLRUCacheSize: 200,
        }}
        highlighterOptions={{}}
      >
        <WorkspaceSessionBootstrap>
          <App />
        </WorkspaceSessionBootstrap>
      </WorkerPoolContextProvider>
    </PacerProvider>
  </Provider>,
);
