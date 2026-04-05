import type { AppSettings, FileTreeRenderMode } from "./contracts";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  version: 1,
  sourceControl: {
    fileTreeRenderMode: "tree",
  },
  lsp: {
    servers: {},
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveFileTreeRenderMode(value: unknown): FileTreeRenderMode {
  return value === "list" ? "list" : "tree";
}

function resolveLspServerCommand(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function resolveLspServerArgs(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((arg): arg is string => typeof arg === "string");
}

function resolveLspServerExtensions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const extensions = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (extensions.length === 0) {
    return undefined;
  }

  return extensions;
}

function resolveLspServerSettings(value: unknown): AppSettings["lsp"]["servers"] {
  if (!isObject(value)) {
    return {};
  }

  const servers: AppSettings["lsp"]["servers"] = {};

  for (const [languageId, rawServer] of Object.entries(value)) {
    if (!isObject(rawServer)) {
      continue;
    }

    const command = resolveLspServerCommand(rawServer.command);
    if (!command) {
      continue;
    }

    const extensions = resolveLspServerExtensions(rawServer.extensions);
    servers[languageId] = {
      command,
      args: resolveLspServerArgs(rawServer.args),
      ...(extensions ? { extensions } : {}),
    };
  }

  return servers;
}

export function createAppSettings(settings?: unknown): AppSettings {
  if (!isObject(settings)) {
    return DEFAULT_APP_SETTINGS;
  }

  const sourceControl = isObject(settings.sourceControl) ? settings.sourceControl : {};
  const lsp = isObject(settings.lsp) ? settings.lsp : {};
  const servers = resolveLspServerSettings(lsp.servers);

  return {
    version: 1,
    sourceControl: {
      fileTreeRenderMode: resolveFileTreeRenderMode(sourceControl.fileTreeRenderMode),
    },
    lsp: {
      servers,
    },
  };
}
