import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  AppSettings,
  CloseLspDocumentInput,
  GetLspHoverInput,
  GetLspReferencesInput,
  LspDiagnostic,
  LspDiagnosticSeverity,
  LspDiagnosticsEvent,
  LspHoverResult,
  LspLocation,
  SyncLspDocumentInput,
} from "../../src/platform/desktop/contracts";
import { createAppSettings } from "../../src/platform/desktop/appSettings";

import { languageIdForPath } from "./pathLanguage";
import { JsonRpcProtocol } from "./protocol";
import { resolveServerConfigForLanguage } from "./serverCatalog";

type SessionManagerOptions = {
  onDiagnostics(event: LspDiagnosticsEvent): void;
  loadAppSettings?(): Promise<AppSettings>;
};

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timeoutId: ReturnType<typeof setTimeout>;
};

type OpenDocument = {
  relPath: string;
  version: number;
  text: string;
};

type InitializeResult = {
  capabilities?: {
    hoverProvider?: unknown;
    definitionProvider?: unknown;
    referencesProvider?: unknown;
  };
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

type LspRange = {
  start?: {
    line?: number;
    character?: number;
  };
  end?: {
    line?: number;
    character?: number;
  };
};

type LocationResponse =
  | {
      uri?: string;
      range?: LspRange;
    }
  | {
      targetUri?: string;
      targetSelectionRange?: LspRange;
      targetRange?: LspRange;
    }
  | null;

type BasicLocation = {
  uri?: string;
  range?: LspRange;
};

type LocationLink = {
  targetUri?: string;
  targetSelectionRange?: LspRange;
  targetRange?: LspRange;
};

const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;
const INITIALIZE_REQUEST_TIMEOUT_MS = 20_000;
const SHUTDOWN_REQUEST_TIMEOUT_MS = 2_000;

type FileSessionBinding = {
  sessionKey: string;
  languageId: string;
};

function normalizeRelPath(relPath: string) {
  return relPath.replace(/\\/g, "/");
}

function toSessionKey(repoPath: string, languageId: string) {
  return `${repoPath}::${languageId}`;
}

function toFileKey(repoPath: string, relPath: string) {
  return `${repoPath}\u0000${normalizeRelPath(relPath)}`;
}

function toSessionSettingsSignature(languageId: string, settings: AppSettings) {
  return JSON.stringify(settings.lsp.servers[languageId] ?? null);
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

function normalizeDiagnostics(source: DiagnosticsNotification["diagnostics"]): LspDiagnostic[] {
  if (!Array.isArray(source)) {
    return [];
  }

  return source.map((diagnostic) => {
    const startLine = (diagnostic.range?.start?.line ?? 0) + 1;
    const endLine = (diagnostic.range?.end?.line ?? diagnostic.range?.start?.line ?? 0) + 1;
    const startCharacter = (diagnostic.range?.start?.character ?? 0) + 1;
    const endCharacter =
      (diagnostic.range?.end?.character ?? diagnostic.range?.start?.character ?? 0) + 1;

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

function normalizeMarkedString(value: MarkedString): string | null {
  if (typeof value === "string") {
    const nextValue = normalizeLineEndings(value).trim();
    return nextValue.length > 0 ? nextValue : null;
  }

  const nextValue = typeof value.value === "string" ? normalizeLineEndings(value.value).trim() : "";
  if (nextValue.length === 0) {
    return null;
  }

  if (!value.language) {
    return nextValue;
  }

  const singleLine = !nextValue.includes("\n");
  if (singleLine && nextValue.length <= 220) {
    return `\`${nextValue}\``;
  }

  return `\`\`\`${value.language}\n${nextValue}\n\`\`\``;
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

  const rawValue = normalizeLineEndings(contents.value).trim();
  if (rawValue.length === 0) {
    return null;
  }

  return { text: rawValue };
}

function normalizeLocationRange(range: LspRange | undefined) {
  if (!range?.start) {
    return null;
  }

  return {
    line: (range.start.line ?? 0) + 1,
    character: range.start.character ?? 0,
    endLine: (range.end?.line ?? range.start.line ?? 0) + 1,
    endCharacter: range.end?.character ?? range.start.character ?? 0,
  };
}

export function normalizeLspLocationResponse(
  repoPath: string,
  result: LocationResponse | LocationResponse[],
): LspLocation[] {
  const values = Array.isArray(result) ? result : result ? [result] : [];

  return values.flatMap((value) => {
    if (!value || typeof value !== "object") {
      return [];
    }

    const location = value as BasicLocation | LocationLink;
    const isLocationLink =
      "targetUri" in location || "targetSelectionRange" in location || "targetRange" in location;
    const uri = isLocationLink ? location.targetUri : (location as BasicLocation).uri;
    const range = isLocationLink
      ? (location.targetSelectionRange ?? location.targetRange)
      : (location as BasicLocation).range;

    if (!uri) {
      return [];
    }

    const documentPath = toDocumentPath(uri);
    if (!documentPath) {
      return [];
    }

    const relPath = normalizeRelPath(path.relative(repoPath, documentPath));
    if (!relPath || relPath.startsWith("..") || path.isAbsolute(relPath)) {
      return [];
    }

    const normalizedRange = normalizeLocationRange(range);
    if (!normalizedRange) {
      return [];
    }

    return [
      {
        repoPath,
        relPath,
        uri,
        line: normalizedRange.line,
        character: normalizedRange.character,
        endLine: normalizedRange.endLine,
        endCharacter: normalizedRange.endCharacter,
      },
    ];
  });
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
  private disposing = false;
  private serverCapabilities: InitializeResult["capabilities"] | null = null;
  private readonly spawned: Promise<void>;
  private readonly initialized: Promise<void>;

  static async create(
    repoPath: string,
    languageId: string,
    settings: AppSettings,
    onDiagnostics: SessionManagerOptions["onDiagnostics"],
    onExit: () => void,
  ) {
    const serverConfig = await resolveServerConfigForLanguage(languageId, settings);
    if (!serverConfig) {
      throw new Error(`No language server configured for ${languageId}.`);
    }

    const session = new LspSession(repoPath, languageId, serverConfig, onDiagnostics, onExit);
    await session.initialized;
    return session;
  }

  private constructor(
    repoPath: string,
    languageId: string,
    serverConfig: { command: string; args: string[] },
    onDiagnostics: SessionManagerOptions["onDiagnostics"],
    onExit: () => void,
  ) {
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
        this.handleFatalError(error);
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
          this.handleFatalError(error);
          return;
        }

        settled = true;
        reject(error);
        this.closeInternals(this.errorMessage(error));
      });

      this.process.once("exit", (code, signal) => {
        const errorMessage = `Language server for ${languageId} exited (code: ${code ?? "null"}, signal: ${
          signal ?? "null"
        }).`;

        if (!settled) {
          settled = true;
          reject(new Error(errorMessage));
        }

        this.closeInternals(errorMessage);
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

      this.serverCapabilities = initializeResult.capabilities ?? null;
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

    if (!this.isMethodSupported(this.serverCapabilities?.hoverProvider)) {
      return null;
    }

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

  async getDefinition(line: number, character: number, relPath: string): Promise<LspLocation[]> {
    await this.initialized;

    if (!this.isMethodSupported(this.serverCapabilities?.definitionProvider)) {
      return [];
    }

    const uri = toDocumentUri(this.repoPath, relPath);
    if (!this.openDocuments.has(uri)) {
      return [];
    }

    const response = (await this.sendRequest("textDocument/definition", {
      textDocument: {
        uri,
      },
      position: {
        line: Math.max(line - 1, 0),
        character: Math.max(character, 0),
      },
    })) as LocationResponse | LocationResponse[];

    return normalizeLspLocationResponse(this.repoPath, response);
  }

  async getReferences(
    line: number,
    character: number,
    relPath: string,
    includeDeclaration: boolean,
  ): Promise<LspLocation[]> {
    await this.initialized;

    if (!this.isMethodSupported(this.serverCapabilities?.referencesProvider)) {
      return [];
    }

    const uri = toDocumentUri(this.repoPath, relPath);
    if (!this.openDocuments.has(uri)) {
      return [];
    }

    const response = (await this.sendRequest("textDocument/references", {
      textDocument: {
        uri,
      },
      position: {
        line: Math.max(line - 1, 0),
        character: Math.max(character, 0),
      },
      context: {
        includeDeclaration,
      },
    })) as LocationResponse | LocationResponse[];

    return normalizeLspLocationResponse(this.repoPath, response);
  }

  dispose() {
    if (this.closed || this.disposing) {
      return;
    }

    this.disposing = true;
    void this.shutdownAndDispose();
  }

  private handleNotification(method: string, params: unknown) {
    if (method !== "textDocument/publishDiagnostics") {
      return;
    }

    const notification = params as DiagnosticsNotification;
    if (!notification.uri) {
      return;
    }

    if (!this.openDocuments.has(notification.uri)) {
      return;
    }

    const documentPath = toDocumentPath(notification.uri);
    if (!documentPath) {
      return;
    }

    const relPath = normalizeRelPath(path.relative(this.repoPath, documentPath));
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
    clearTimeout(pendingRequest.timeoutId);

    if (error) {
      pendingRequest.reject(new Error(error.message));
      return;
    }

    pendingRequest.resolve(result);
  }

  private sendRequest(method: string, params: unknown) {
    if (this.closed) {
      return Promise.reject(new Error(`Language server session closed for ${this.languageId}.`));
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    return new Promise<unknown>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const pendingRequest = this.pendingRequests.get(requestId);
        if (!pendingRequest) {
          return;
        }

        this.pendingRequests.delete(requestId);
        pendingRequest.reject(new Error(`LSP request timed out: ${method}.`));
      }, this.requestTimeoutMsForMethod(method));

      this.pendingRequests.set(requestId, { resolve, reject, timeoutId });
      this.protocol.sendRequest(requestId, method, params);
    });
  }

  private failPendingRequests(error: unknown) {
    for (const pendingRequest of this.pendingRequests.values()) {
      clearTimeout(pendingRequest.timeoutId);
      pendingRequest.reject(error);
    }

    this.pendingRequests.clear();
  }

  private async shutdownAndDispose() {
    await Promise.race([
      this.initialized.catch(() => {}),
      new Promise<void>((resolve) => {
        setTimeout(resolve, SHUTDOWN_REQUEST_TIMEOUT_MS);
      }),
    ]);

    if (this.closed) {
      return;
    }

    try {
      await this.sendRequest("shutdown", null);
    } catch {
      // Ignore shutdown errors and continue best-effort teardown.
    }

    if (this.closed) {
      return;
    }

    try {
      this.protocol.sendNotification("exit");
    } catch {
      // Ignore exit notification errors during teardown.
    }

    this.closeInternals();
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  private handleFatalError(error: unknown) {
    if (this.closed) {
      return;
    }

    this.closeInternals(this.errorMessage(error));
    if (!this.process.killed) {
      this.process.kill();
    }
  }

  private requestTimeoutMsForMethod(method: string) {
    switch (method) {
      case "initialize":
        return INITIALIZE_REQUEST_TIMEOUT_MS;
      case "shutdown":
        return SHUTDOWN_REQUEST_TIMEOUT_MS;
      default:
        return DEFAULT_REQUEST_TIMEOUT_MS;
    }
  }

  private isMethodSupported(capability: unknown) {
    return capability !== false;
  }

  private errorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return String(error);
  }

  private closeInternals(reason?: string) {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.disposing = false;
    this.protocol.dispose();
    this.failPendingRequests(
      new Error(reason ?? `Language server session closed for ${this.languageId}.`),
    );
    this.onExit();
  }
}

export class LspSessionManager {
  private readonly sessions = new Map<string, Promise<LspSession>>();
  private readonly sessionSettingsSignatures = new Map<string, string>();
  private readonly fileSessionByFile = new Map<string, FileSessionBinding>();
  private readonly onDiagnostics: SessionManagerOptions["onDiagnostics"];
  private readonly loadAppSettings: NonNullable<SessionManagerOptions["loadAppSettings"]>;

  constructor({ onDiagnostics, loadAppSettings }: SessionManagerOptions) {
    this.onDiagnostics = onDiagnostics;
    this.loadAppSettings = loadAppSettings ?? (async () => createAppSettings());
  }

  async syncDocument({ repoPath, relPath, text }: SyncLspDocumentInput) {
    const settings = await this.loadNormalizedSettings();
    const fileKey = toFileKey(repoPath, relPath);
    const previousBinding = this.fileSessionByFile.get(fileKey);
    const languageId = languageIdForPath(relPath, settings.lsp.servers);

    if (!languageId) {
      if (previousBinding) {
        this.fileSessionByFile.delete(fileKey);
        await this.closeBoundSessionDocument(previousBinding.sessionKey, relPath);
      }
      this.emitDiagnostics(repoPath, relPath, null, [], "Unsupported language.");
      return;
    }

    const nextSessionKey = toSessionKey(repoPath, languageId);
    if (previousBinding && previousBinding.sessionKey !== nextSessionKey) {
      this.fileSessionByFile.delete(fileKey);
      await this.closeBoundSessionDocument(previousBinding.sessionKey, relPath);
    }

    try {
      const session = await this.getSession(repoPath, languageId, settings);
      await session.syncDocument(relPath, text);
      this.fileSessionByFile.set(fileKey, {
        sessionKey: nextSessionKey,
        languageId,
      });
    } catch (error) {
      this.fileSessionByFile.delete(fileKey);
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
    const settings = await this.loadNormalizedSettings();
    const fileKey = toFileKey(repoPath, relPath);
    const binding = this.fileSessionByFile.get(fileKey);
    const fallbackLanguageId = languageIdForPath(relPath, settings.lsp.servers);
    const languageId = binding?.languageId ?? fallbackLanguageId ?? null;

    this.emitDiagnostics(repoPath, relPath, languageId, [], null);
    this.fileSessionByFile.delete(fileKey);

    const sessionKey =
      binding?.sessionKey ??
      (fallbackLanguageId ? toSessionKey(repoPath, fallbackLanguageId) : null);
    if (!sessionKey) {
      return;
    }

    await this.closeBoundSessionDocument(sessionKey, relPath);
  }

  async getHover({
    repoPath,
    relPath,
    line,
    character,
  }: GetLspHoverInput): Promise<LspHoverResult | null> {
    const settings = await this.loadNormalizedSettings();
    const sessionPromise = this.resolveSessionPromiseForFile(repoPath, relPath, settings);
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

  async getDefinition({
    repoPath,
    relPath,
    line,
    character,
  }: GetLspHoverInput): Promise<LspLocation[]> {
    const settings = await this.loadNormalizedSettings();
    const sessionPromise = this.resolveSessionPromiseForFile(repoPath, relPath, settings);
    if (!sessionPromise) {
      return [];
    }

    try {
      const session = await sessionPromise;
      return await session.getDefinition(line, character, relPath);
    } catch {
      return [];
    }
  }

  async getReferences({
    repoPath,
    relPath,
    line,
    character,
    includeDeclaration = false,
  }: GetLspReferencesInput): Promise<LspLocation[]> {
    const settings = await this.loadNormalizedSettings();
    const sessionPromise = this.resolveSessionPromiseForFile(repoPath, relPath, settings);
    if (!sessionPromise) {
      return [];
    }

    try {
      const session = await sessionPromise;
      return await session.getReferences(line, character, relPath, includeDeclaration);
    } catch {
      return [];
    }
  }

  async dispose() {
    const sessions = Array.from(this.sessions.values());
    this.sessions.clear();
    this.sessionSettingsSignatures.clear();
    this.fileSessionByFile.clear();

    for (const sessionPromise of sessions) {
      try {
        const session = await sessionPromise;
        session.dispose();
      } catch {
        continue;
      }
    }
  }

  private getSession(repoPath: string, languageId: string, settings: AppSettings) {
    const key = toSessionKey(repoPath, languageId);
    const nextSignature = toSessionSettingsSignature(languageId, settings);
    const existing = this.sessions.get(key);
    const existingSignature = this.sessionSettingsSignatures.get(key);

    if (existing && existingSignature === nextSignature) {
      return existing;
    }

    if (existing && existingSignature !== nextSignature) {
      this.sessions.delete(key);
      this.sessionSettingsSignatures.delete(key);
      this.clearFileBindingsForSessionKey(key);
      void existing
        .then((session) => {
          session.dispose();
        })
        .catch(() => {});
    }

    const sessionPromise = LspSession.create(
      repoPath,
      languageId,
      settings,
      this.onDiagnostics,
      () => {
        this.sessions.delete(key);
        this.sessionSettingsSignatures.delete(key);
        this.clearFileBindingsForSessionKey(key);
      },
    ).catch((error) => {
      this.sessions.delete(key);
      this.sessionSettingsSignatures.delete(key);
      this.clearFileBindingsForSessionKey(key);
      throw error;
    });

    this.sessions.set(key, sessionPromise);
    this.sessionSettingsSignatures.set(key, nextSignature);
    return sessionPromise;
  }

  private resolveSessionPromiseForFile(repoPath: string, relPath: string, settings: AppSettings) {
    const binding = this.fileSessionByFile.get(toFileKey(repoPath, relPath));
    if (binding) {
      const sessionPromise = this.sessions.get(binding.sessionKey);
      if (sessionPromise) {
        return sessionPromise;
      }
    }

    const languageId = languageIdForPath(relPath, settings.lsp.servers);
    if (!languageId) {
      return null;
    }

    return this.sessions.get(toSessionKey(repoPath, languageId)) ?? null;
  }

  private clearFileBindingsForSessionKey(sessionKey: string) {
    for (const [fileKey, binding] of this.fileSessionByFile.entries()) {
      if (binding.sessionKey === sessionKey) {
        this.fileSessionByFile.delete(fileKey);
      }
    }
  }

  private async closeBoundSessionDocument(sessionKey: string, relPath: string) {
    const sessionPromise = this.sessions.get(sessionKey);
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

  private async loadNormalizedSettings(): Promise<AppSettings> {
    try {
      const settings = await this.loadAppSettings();
      return createAppSettings(settings);
    } catch {
      return createAppSettings();
    }
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
      relPath: normalizeRelPath(relPath),
      languageId,
      diagnostics,
      reason,
    });
  }
}
