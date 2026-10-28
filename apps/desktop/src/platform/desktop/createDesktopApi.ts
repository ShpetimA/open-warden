import { readDesktopReply } from "./failure";
import type { DesktopApi, DesktopHandlers, DesktopUpdateApi } from "./contracts";
import { DESKTOP_API_METHODS, type DesktopApiMethod } from "./desktopApiMethods";

type DesktopApiInvoker = (method: DesktopApiMethod, ...args: unknown[]) => unknown;

type DesktopApiMethodFactory = (method: DesktopApiMethod) => (...args: unknown[]) => unknown;

export function createDesktopApiFromInvoker(invoke: DesktopApiInvoker): DesktopApi {
  const desktopApi: Partial<Record<DesktopApiMethod, (...args: unknown[]) => unknown>> = {};

  for (const method of DESKTOP_API_METHODS) {
    desktopApi[method] = (...args: unknown[]) => invoke(method, ...args);
  }

  // SAFETY: every registered method forwards its arguments and the matching result unchanged.
  return desktopApi as DesktopApi;
}

export function createDesktopApiForwarder(getDesktopApi: () => DesktopApi): DesktopApi {
  return createDesktopApiFromInvoker((method, ...args) => {
    const handler = getDesktopApi()[method] as (...parameters: unknown[]) => unknown;
    return readDesktopReply(async () => handler(...args), method);
  });
}

export function createDesktopApiWithDefaults(options: {
  fallback: DesktopApiMethodFactory;
  overrides?: Partial<DesktopHandlers>;
}): DesktopHandlers {
  const desktopApi: Partial<Record<DesktopApiMethod, (...args: unknown[]) => unknown>> = {};

  for (const method of DESKTOP_API_METHODS) {
    const override = options.overrides?.[method] as ((...args: unknown[]) => unknown) | undefined;
    desktopApi[method] = override ?? options.fallback(method);
  }

  return desktopApi as DesktopHandlers;
}

export const DESKTOP_UPDATE_COMMANDS = [
  "getUpdateState",
  "checkForUpdates",
  "downloadUpdate",
  "installUpdate",
] as const;
type UpdateCommand = (typeof DESKTOP_UPDATE_COMMANDS)[number];

export function createDesktopUpdateCommands(
  invoke: (method: UpdateCommand) => Promise<unknown>,
): Omit<DesktopUpdateApi, "onUpdateState"> {
  const commands = Object.fromEntries(
    DESKTOP_UPDATE_COMMANDS.map((method) => [
      method,
      () => readDesktopReply(() => invoke(method), method),
    ]),
  );
  // SAFETY: the fixed registry maps each native update command to its matching reply type.
  return commands as Omit<DesktopUpdateApi, "onUpdateState">;
}
