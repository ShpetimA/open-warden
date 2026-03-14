import type { DesktopBridge } from "./contracts";

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
    openWarden?: DesktopBridge;
  }
}

export type OpenWardenDesktopBridge = DesktopBridge;
