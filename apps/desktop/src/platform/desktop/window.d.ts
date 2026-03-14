import type { DesktopApi } from "./contracts";

declare global {
  interface Window {
    desktopBridge?: DesktopApi;
    openWarden?: DesktopApi;
  }
}

export {};
