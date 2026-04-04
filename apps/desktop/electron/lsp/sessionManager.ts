import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  CloseLspDocumentInput,
  GetLspHoverInput,
  LspDiagnostic,
  LspDiagnosticSeverity,
  LspDiagnosticsEvent,
  LspHoverResult,
  SyncLspDocumentInput,
} from "../../src/platform/desktop/contracts";

import { languageIdForPath } from "./pathLanguage";
import { JsonRpcProtocol } from "./protocol";
import { serverConfigForLanguage } from "./serverCatalog";

type SessionManagerOptions = {
  onDiagnostics(event: LspDiagnosticsEvent): void;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: unknown): void;
};

type OpenDocument = {
  relPath: string;
  version: number;
  text: string;
};

type InitializeResult = {
  capabilities?: unknown;
};

type DiagnosticsNotification = {
  uri?: string;
  diagnostics?: Array<{
    message?: string;
    severity?: number;
    source?: string;
    code?: string | number;
    range?: {
      start?: {
        line?: number;
        character?: number;
      };
      end?: {
        line?: number;
        character?: number;
      };
    };
  }>;
};

type MarkedString = string | { language?: string; value?: string };

type HoverResponse = {
  contents?: string | { kind?: string; value?: string } | MarkedString[];
} | null;

function toSessionKey(repoPath: string, languageId: string) {
  return `${repoPath}::${languageId}`;
}

function toDocumentUri(repoPath: string, relPath: string) {
  return pathToFileURL(path.join(repoPath, relPath)).href;
}

function toDiagnosticSeverity(severity: number | undefined): LspDiagnosticSeverity {
  switch (severity) {
    case 1:
      return "error";
    case 2:
      return "warning";
    case 3:
      return "information";
    case 4:
      return "hint";
    default:
      return "error";
  }
}

function toDocumentPath(uri: string) {
  try {
    return fileURLToPath(uri);
  } catch {
    return null;
  }
}

function normalizeDiagnostics(
  source: DiagnosticsNotification["diagnostics"],
): LspDiagnostic[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((diagnostic) => {
    const startLine = (diagnostic.range?.start?.line ?? 0) + 1;
    const endLine = (diagnostic.range?.end?.line ?? diagnostic.range?.start?.line ?? 0) + 1;
    const startCharacter = (diagnostic.range?.start?.character ?? 0) + 1;
    const endCharacter = (diagnostic.range?.end?.character ?? diagnostic.range?.start?.character ?? 0) + 1;

    return {
      message: diagnostic.message ?? "Unknown diagnostic",
      severity: toDiagnosticSeverity(diagnostic.severity),
      source: diagnostic.source ?? null,
      code: diagnostic.code === undefined ? null : String(diagnostic.code),
      startLine,
      endLine,
      startCharacter,
      endCharacter,
    };
  });
}

function normalizeLineEndings(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function stripMarkdownFormatting(value: string) {
  return normalizeLineEndings(value)
    .replace(/```[^\n]*\n([\s\S]*?)```/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .trim();
}

function normalizeMarkedString(value: MarkedString): string | null {
  if (typeof value === "string") {
    const nextValue = normalizeLineEndings(value).trim();
    return nextValue.length > 0 ? nextValue : null;
  }

  const nextValue = typeof value.value === "string" ? normalizeLineEndings(value.value).trim() : "";
  return nextValue.length > 0 ? nextValue : null;
}

export function normalizeLspHoverResponse(result: HoverResponse): LspHoverResult | null {
  const contents = result?.contents;
  if (!contents) {
    return null;
  }

  if (typeof contents === "string") {
    const text = normalizeLineEndings(contents).trim();
    return text.length > 0 ? { text } : null;
  }

  if (Array.isArray(contents)) {
    const text = contents
      .map(normalizeMarkedString)
      .filter((value): value is string => Boolean(value))
      .join("\n\n")
      .trim();
    return text.length > 0 ? { text } : null;
  }

  if (typeof contents.value !== "string") {
    return null;
  }

  const rawValue = contents.value.trim();
  if (rawValue.length === 0) {
    return null;
  }

  const text =
    contents.kind === "markdown" ? stripMarkdownFormatting(rawValue) : normalizeLineEndings(rawValue);
  return text.length > 0 ? { text } : null;
}

class LspSession {
  private readonly repoPath: string;
  private readonly languageId: string;
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly protocol: JsonRpcProtocol;
  private readonly pendingRequests = new Map<number, PendingRequest>();
  private readonly openDocuments = new Map<string, OpenDocument>();
  private readonly onDiagnostics: SessionManagerOptions["onDiagnostics"];
  private readonly onExit: () => void;
  private nextRequestId = 1;
  private closed = false;
  private readonly spawned: Promise<void>;
  private readonly initialized: Promise<void>;

  static async create(
    repoPath: string,
    languageId: string,
    onDiagnostics: SessionManagerOptions["onDiagnostics"],
    onExit: () => void,
  ) {
    const session = new LspSession(repoPath, languageId, onDiagnostics, onExit);
    await session.initialized;
    return session;
  }

  private constructor(
    repoPath: string,
    languageId: string,
    onDiagnostics: SessionManagerOptions["onDiagnostics"],
    onExit: () => void,
  ) {
    const serverConfig = serverConfigForLanguage(languageId);
    if (!serverConfig) {
      throw new Error(`No language server configured for ${languageId}.`);
    }

    this.repoPath = repoPath;
    this.languageId = languageId;
    this.onDiagnostics = onDiagnostics;
    this.onExit = onExit;

    this.process = spawn(serverConfig.command, serverConfig.args, {
      cwd: repoPath,
      stdio: "pipe",
    });

    this.protocol = new JsonRpcProtocol({
      input: this.process.stdout,
      output: this.process.stdin,
      onNotification: (method, params) => {
        this.handleNotification(method, params);
      },
      onRequest: (id, method, params) => {
        this.handleServerRequest(id, method, params);
      },
      onResponse: (id, result, error) => {
        this.handleResponse(id, result, error);
      },
      onTransportError: (error) => {
        this.failPendingRequests(error);
      },
    });

    this.process.stderr.on("data", () => {});

    this.spawned = new Promise<void>((resolve, reject) => {
      let settled = false;

      this.process.once("spawn", () => {
        settled = true;
        resolve();
      });

      this.process.once("error", (error) => {
        if (settled) {
          this.failPendingRequests(error);
          return;
        }

        settled = true;
        reject(error);
      });

      this.process.once("exit", (code, signal) => {
        const error = new Error(
          `Language server for ${languageId} exited (code: ${code ?? "null"}, signal: ${
            signal ?? "null"
          }).`,
        );

        if (!settled) {
          settled = true;
          reject(error);
        } else {
          this.failPendingRequests(error);
        }

        this.closeInternals();
      });
    });

    this.initialized = this.spawned.then(async () => {
      const initializeResult = (await this.sendRequest("initialize", {
        processId: process.pid,
        clientInfo: {
          name: "OpenWarden",
        },
        locale: "en",
        rootUri: pathToFileURL(repoPath).href,
        capabilities: {
          textDocument: {
            publishDiagnostics: {
              relatedInformation: true,
            },
          },
          workspace: {
            configuration: true,
          },
        },
      })) as InitializeResult;

      void initializeResult;
      this.protocol.sendNotification("initialized", {});
    });
  }

  async syncDocument(relPath: string, text: string) {
    await this.initialized;

    const uri = toDocumentUri(this.repoPath, relPath);
    const existingDocument = this.openDocuments.get(uri);
    if (!existingDocument) {
      this.openDocuments.set(uri, {
        relPath,
        version: 1,
        text,
      });

      this.protocol.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: this.languageId,
          version: 1,
          text,
        },
      });
      return;
    }

    if (existingDocument.text === text) {
      return;
    }

    const nextVersion = existingDocument.version + 1;
    existingDocument.version = nextVersion;
    existingDocument.text = text;

    this.protocol.sendNotification("textDocument/didChange", {
      textDocument: {
        uri,
        version: nextVersion,
      },
      contentChanges: [
        {
          text,
        },
      ],
    });
  }

  async closeDocument(relPath: string) {
    if (this.closed) {
      return;
    }

    await this.initialized.catch(() => {});

    const uri = toDocumentUri(this.repoPath, relPath);
    if (!this.openDocuments.has(uri)) {
      return;
    }

    this.openDocuments.delete(uri);
    this.protocol.sendNotification("textDocument/didClose", {
      textDocument: {
        uri,
      },
    });
  }

  async getHover(line: number, character: number, relPath: string): Promise<LspHoverResult | null> {
    await this.initialized;

    const uri = toDocumentUri(this.repoPath, relPath);
    if (!this.openDocuments.has(uri)) {
      return null;
    }

    const response = (await this.sendRequest("textDocument/hover", {
      textDocument: {
        uri,
      },
      position: {
        line: Math.max(line - 1, 0),
        character: Math.max(character, 0),
      },
    })) as HoverResponse;

    return normalizeLspHoverResponse(response);
  }

  dispose() {
    if (this.closed) {
      return;
    }

    this.closeInternals();
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  private handleNotification(method: string, params: unknown) {
    if (method !== "textDocument/publishDiagnostics") {
      return;
    }

    const notification = params as DiagnosticsNotification;
    if (!notification.uri) {
      return;
    }

    const documentPath = toDocumentPath(notification.uri);
    if (!documentPath) {
      return;
    }

    const relPath = path.relative(this.repoPath, documentPath);
    if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return;
    }

    this.onDiagnostics({
      repoPath: this.repoPath,
      relPath,
      languageId: this.languageId,
      diagnostics: normalizeDiagnostics(notification.diagnostics),
      reason: null,
    });
  }

  private handleServerRequest(id: number | string | null, method: string, _params: unknown) {
    switch (method) {
      case "workspace/configuration":
        this.protocol.sendResponse(id, []);
        return;
      case "workspace/workspaceFolders":
        this.protocol.sendResponse(id, null);
        return;
      case "client/registerCapability":
      case "client/unregisterCapability":
      case "window/workDoneProgress/create":
        this.protocol.sendResponse(id, null);
        return;
      default:
        this.protocol.sendErrorResponse(id, {
          code: -32601,
          message: `Unsupported request: ${method}`,
        });
    }
  }

  private handleResponse(
    id: number | string | null,
    result: unknown,
    error?: { code: number; message: string },
  ) {
    if (typeof id !== "number") {
      return;
    }

    const pendingRequest = this.pendingRequests.get(id);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(id);

    if (error) {
      pendingRequest.reject(new Error(error.message));
      return;
    }

    pendingRequest.resolve(result);
  }

  private sendRequest(method: string, params: unknown) {
    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<unknown>((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.protocol.sendRequest(requestId, method, params);
    });
  }

  private failPendingRequests(error: unknown) {
    for (const pendingRequest of this.pendingRequests.values()) {
      pendingRequest.reject(error);
    }

    this.pendingRequests.clear();
  }

  private closeInternals() {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.protocol.dispose();
    this.failPendingRequests(new Error(`Language server session closed for ${this.languageId}.`));
    this.onExit();
  }
}

export class LspSessionManager {
  private readonly sessions = new Map<string, Promise<LspSession>>();
  private readonly onDiagnostics: SessionManagerOptions["onDiagnostics"];

  constructor({ onDiagnostics }: SessionManagerOptions) {
    this.onDiagnostics = onDiagnostics;
  }

  async syncDocument({ repoPath, relPath, text }: SyncLspDocumentInput) {
    const languageId = languageIdForPath(relPath);
    if (!languageId) {
      this.emitDiagnostics(repoPath, relPath, null, [], "Unsupported language.");
      return;
    }

    try {
      const session = await this.getSession(repoPath, languageId);
      await session.syncDocument(relPath, text);
    } catch (error) {
      this.emitDiagnostics(
        repoPath,
        relPath,
        languageId,
        [],
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async closeDocument({ repoPath, relPath }: CloseLspDocumentInput) {
    const languageId = languageIdForPath(relPath);
    this.emitDiagnostics(repoPath, relPath, languageId, [], null);

    if (!languageId) {
      return;
    }

    const sessionPromise = this.sessions.get(toSessionKey(repoPath, languageId));
    if (!sessionPromise) {
      return;
    }

    try {
      const session = await sessionPromise;
      await session.closeDocument(relPath);
    } catch {
      return;
    }
  }

  async getHover({
    repoPath,
    relPath,
    line,
    character,
  }: GetLspHoverInput): Promise<LspHoverResult | null> {
    const languageId = languageIdForPath(relPath);
    if (!languageId) {
      return null;
    }

    const sessionPromise = this.sessions.get(toSessionKey(repoPath, languageId));
    if (!sessionPromise) {
      return null;
    }

    try {
      const session = await sessionPromise;
      return await session.getHover(line, character, relPath);
    } catch {
      return null;
    }
  }

  async dispose() {
    const sessions = Array.from(this.sessions.values());
    this.sessions.clear();

    for (const sessionPromise of sessions) {
      try {
        const session = await sessionPromise;
        session.dispose();
      } catch {
        continue;
      }
    }
  }

  private getSession(repoPath: string, languageId: string) {
    const key = toSessionKey(repoPath, languageId);
    const existing = this.sessions.get(key);
    if (existing) {
      return existing;
    }

    const sessionPromise = LspSession.create(repoPath, languageId, this.onDiagnostics, () => {
      this.sessions.delete(key);
    }).catch((error) => {
      this.sessions.delete(key);
      throw error;
    });

    this.sessions.set(key, sessionPromise);
    return sessionPromise;
  }

  private emitDiagnostics(
    repoPath: string,
    relPath: string,
    languageId: string | null,
    diagnostics: LspDiagnostic[],
    reason: string | null,
  ) {
    this.onDiagnostics({
      repoPath,
      relPath,
      languageId,
      diagnostics,
      reason,
    });
  }
}
