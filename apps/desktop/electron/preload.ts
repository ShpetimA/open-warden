import { contextBridge, ipcRenderer } from "electron";

import { createDesktopApiFromInvoker } from "../src/platform/desktop/createDesktopApi";
import type { DesktopBridge } from "../src/platform/desktop/contracts";
import {
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
  ipcRenderer.invoke(DESKTOP_INVOKE_CHANNEL, method, ...args),
);

const desktopBridge: DesktopBridge = {
  ...desktopApi,
  getUpdateState: () => ipcRenderer.invoke(UPDATE_GET_STATE_CHANNEL),
  checkForUpdates: () => ipcRenderer.invoke(UPDATE_CHECK_CHANNEL),
  downloadUpdate: () => ipcRenderer.invoke(UPDATE_DOWNLOAD_CHANNEL),
  installUpdate: () => ipcRenderer.invoke(UPDATE_INSTALL_CHANNEL),
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
