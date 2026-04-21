import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { PacerProvider } from "@tanstack/react-pacer";
import "./index.css";
import App from "./App.tsx";
import { store } from "./app/store";
import { DesktopUpdateBootstrap } from "./features/desktop-update/DesktopUpdateBootstrap";
import { LspDiagnosticsBootstrap } from "./features/lsp/LspDiagnosticsBootstrap";
import { AppSettingsBootstrap } from "./features/settings/AppSettingsBootstrap";
import { WorkspaceSessionBootstrap } from "./features/source-control/WorkspaceSessionBootstrap";
import { DiffWorkerPoolProvider } from "@/provider/DiffWorkerProvider.tsx";

createRoot(document.getElementById("root")!).render(
  <Provider store={store}>
    <DesktopUpdateBootstrap />
    <LspDiagnosticsBootstrap />
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
      <DiffWorkerPoolProvider>
        <AppSettingsBootstrap>
          <WorkspaceSessionBootstrap>
            <App />
          </WorkspaceSessionBootstrap>
        </AppSettingsBootstrap>
      </DiffWorkerPoolProvider>
    </PacerProvider>
  </Provider>,
);
