import { repositoryChangeSchema } from "../src/platform/desktop/repositoryEvents";
import { readDesktopReply } from "../src/platform/desktop/failure";
import { contextBridge, ipcRenderer } from "electron";

import { guidanceNavigateSchema } from "../src/platform/desktop/guidance";
import {
  createDesktopApiFromInvoker,
  createDesktopUpdateCommands,
} from "../src/platform/desktop/createDesktopApi";
import type { DesktopBridge } from "../src/platform/desktop/contracts";
import {
  REPOSITORY_CHANGED_CHANNEL,
  WORKSPACE_FLUSH_REQUEST_CHANNEL,
  WORKSPACE_FLUSH_REPLY_CHANNEL,
  GUIDANCE_NAVIGATE_CHANNEL,
  APP_SETTINGS_CHANGED_CHANNEL,
  DESKTOP_INVOKE_CHANNEL,
  LSP_DIAGNOSTICS_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_STATE_CHANNEL,
} from "./ipc-channels";

const desktopApi = createDesktopApiFromInvoker((method, ...args) =>
  readDesktopReply(() => ipcRenderer.invoke(DESKTOP_INVOKE_CHANNEL, method, ...args), method),
);

let workspaceFlushListener: (() => Promise<boolean>) | null = null;
ipcRenderer.on(WORKSPACE_FLUSH_REQUEST_CHANNEL, (_event, requestId: unknown) => {
  if (typeof requestId !== "string" || requestId.length > 100) return;
  const saved = workspaceFlushListener ? workspaceFlushListener() : Promise.resolve(true);
  void saved.then(
    (ok) => ipcRenderer.send(WORKSPACE_FLUSH_REPLY_CHANNEL, requestId, ok === true),
    () => ipcRenderer.send(WORKSPACE_FLUSH_REPLY_CHANNEL, requestId, false),
  );
});

const desktopBridge: DesktopBridge = {
  onRepositoryChanged(listener) {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = repositoryChangeSchema.safeParse(value);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(REPOSITORY_CHANGED_CHANNEL, receive);
    return () => {
      ipcRenderer.removeListener(REPOSITORY_CHANGED_CHANNEL, receive);
    };
  },
  onWorkspaceFlushRequested(listener) {
    workspaceFlushListener = listener;
    return () => {
      if (workspaceFlushListener === listener) workspaceFlushListener = null;
    };
  },
  onGuidanceNavigate(listener) {
    const receive = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = guidanceNavigateSchema.safeParse(value);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(GUIDANCE_NAVIGATE_CHANNEL, receive);
    return () => ipcRenderer.removeListener(GUIDANCE_NAVIGATE_CHANNEL, receive);
  },
  ...desktopApi,
  ...createDesktopUpdateCommands((method) =>
    ipcRenderer.invoke(
      {
        getUpdateState: UPDATE_GET_STATE_CHANNEL,
        checkForUpdates: UPDATE_CHECK_CHANNEL,
        downloadUpdate: UPDATE_DOWNLOAD_CHANNEL,
        installUpdate: UPDATE_INSTALL_CHANNEL,
      }[method],
    ),
  ),
  onUpdateState: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, state: unknown) => {
      if (typeof state !== "object" || state === null) {
        return;
      }

      listener(state as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(UPDATE_STATE_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(UPDATE_STATE_CHANNEL, wrappedListener);
    };
  },
  onLspDiagnostics: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, event: unknown) => {
      if (typeof event !== "object" || event === null) {
        return;
      }

      listener(event as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(LSP_DIAGNOSTICS_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(LSP_DIAGNOSTICS_CHANNEL, wrappedListener);
    };
  },
  onAppSettingsChanged: (listener) => {
    const wrappedListener = (_event: Electron.IpcRendererEvent, settings: unknown) => {
      if (typeof settings !== "object" || settings === null) {
        return;
      }

      listener(settings as Parameters<typeof listener>[0]);
    };

    ipcRenderer.on(APP_SETTINGS_CHANGED_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(APP_SETTINGS_CHANGED_CHANNEL, wrappedListener);
    };
  },
};

contextBridge.exposeInMainWorld("desktopBridge", desktopBridge);
contextBridge.exposeInMainWorld("openWarden", desktopBridge);
