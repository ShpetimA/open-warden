import { captureDesktopOperation } from "../src/platform/desktop/failure";
import { classifyDesktopFailure } from "./desktop-failure";
import path from "node:path";

import { app, BrowserWindow, ipcMain, protocol, shell } from "electron";

import { watchAppSettings } from "./appSettings";
import {
  configureGuidanceNavigation,
  initializeGuidanceConnection,
  disposeGuidanceConnection,
} from "./guidance/runtime";
import { configureDesktopApi, desktopApi, disposeDesktopApi } from "./desktop-api";
import {
  GUIDANCE_NAVIGATE_CHANNEL,
  APP_SETTINGS_CHANGED_CHANNEL,
  DESKTOP_INVOKE_CHANNEL,
  LSP_DIAGNOSTICS_CHANNEL,
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
} from "./ipc-channels";
import { resolvePreloadPath } from "./preload-path";
import { handleProviderMediaRequest } from "./providerMedia";
import { PROVIDER_MEDIA_SCHEME } from "../src/platform/desktop/providerMedia";
import { createUpdateManager } from "./updateManager";

type DesktopMethod = keyof typeof desktopApi;
let mainWindow: BrowserWindow | null = null;
let disposeAppSettingsWatcher: (() => void) | null = null;
let quitCleanupStarted = false;
let quitCleanupFinished = false;
const updateManager = createUpdateManager({
  getWindow: () => mainWindow,
});
const gotSingleInstanceLock = app.requestSingleInstanceLock();

protocol.registerSchemesAsPrivileged([
  {
    scheme: PROVIDER_MEDIA_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

if (!gotSingleInstanceLock) {
  app.quit();
}

configureDesktopApi({
  onDiagnostics(event) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(LSP_DIAGNOSTICS_CHANNEL, event);
  },
});

function resolveRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL?.trim() || null;
}

function resolveRendererHtmlPath() {
  return path.resolve(__dirname, "../../dist/index.html");
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: "OpenWarden",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: process.platform === "darwin" ? { x: 16, y: 13 } : undefined,
    webPreferences: {
      preload: resolvePreloadPath(__dirname),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow = window;

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const rendererUrl = resolveRendererUrl();
    const currentUrl = window.webContents.getURL();

    if (url !== currentUrl && !(rendererUrl && url.startsWith(rendererUrl))) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const rendererUrl = resolveRendererUrl();

  if (rendererUrl) {
    void window.loadURL(rendererUrl);
  } else {
    void window.loadFile(resolveRendererHtmlPath());
  }

  return window;
}

app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
    return;
  }

  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

ipcMain.removeHandler(DESKTOP_INVOKE_CHANNEL);
ipcMain.handle(
  DESKTOP_INVOKE_CHANNEL,
  async (_event, method: DesktopMethod, ...args: unknown[]) => {
    if (!Object.hasOwn(desktopApi, method)) {
      return {
        ok: false,
        error: {
          operation: "desktop.invoke",
          code: "unavailable",
          message: "This desktop operation is unavailable. Reload the app and try again.",
        },
      };
    }

    const handler = desktopApi[method] as (...params: unknown[]) => unknown;
    return captureDesktopOperation(method, () => handler(...args), classifyDesktopFailure);
  },
);
ipcMain.removeHandler(UPDATE_GET_STATE_CHANNEL);
ipcMain.handle(UPDATE_GET_STATE_CHANNEL, async () =>
  captureDesktopOperation("getUpdateState", () => updateManager.getState(), classifyDesktopFailure),
);
ipcMain.removeHandler(UPDATE_CHECK_CHANNEL);
ipcMain.handle(UPDATE_CHECK_CHANNEL, async () =>
  captureDesktopOperation(
    "checkForUpdates",
    () => updateManager.checkForUpdates("manual"),
    classifyDesktopFailure,
  ),
);
ipcMain.removeHandler(UPDATE_DOWNLOAD_CHANNEL);
ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async () =>
  captureDesktopOperation(
    "downloadUpdate",
    () => updateManager.downloadUpdate(),
    classifyDesktopFailure,
  ),
);
ipcMain.removeHandler(UPDATE_INSTALL_CHANNEL);
ipcMain.handle(UPDATE_INSTALL_CHANNEL, async () =>
  captureDesktopOperation(
    "installUpdate",
    () => updateManager.installUpdate(),
    classifyDesktopFailure,
  ),
);

app.whenReady().then(() => {
  configureGuidanceNavigation((target) => {
    const window = mainWindow ?? createMainWindow();
    const send = () => window.webContents.send(GUIDANCE_NAVIGATE_CHANNEL, target);
    if (window.webContents.isLoadingMainFrame()) window.webContents.once("did-finish-load", send);
    else send();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  void initializeGuidanceConnection();
  protocol.handle(PROVIDER_MEDIA_SCHEME, handleProviderMediaRequest);
  createMainWindow();
  updateManager.initialize();
  void watchAppSettings({
    onChange(settings) {
      if (!mainWindow || mainWindow.isDestroyed()) {
        return;
      }

      mainWindow.webContents.send(APP_SETTINGS_CHANGED_CHANNEL, settings);
    },
    onError(error) {
      console.error("Failed to reload app settings", error);
    },
  }).then((dispose) => {
    disposeAppSettingsWatcher = dispose;
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", (event) => {
  if (quitCleanupFinished) {
    return;
  }

  event.preventDefault();
  if (quitCleanupStarted) {
    return;
  }

  quitCleanupStarted = true;
  updateManager.dispose();
  disposeAppSettingsWatcher?.();
  disposeAppSettingsWatcher = null;
  void (async () => {
    try {
      await disposeGuidanceConnection();
      await disposeDesktopApi();
    } catch (error) {
      console.error("Failed to dispose desktop services", error);
    } finally {
      quitCleanupFinished = true;
      app.quit();
    }
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
