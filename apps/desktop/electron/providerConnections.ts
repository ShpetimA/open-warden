import { promises as fs } from "node:fs";
import path from "node:path";

import { app, safeStorage } from "electron";

import type {
  ProviderAuthType,
  ConnectProviderInput,
  GitProviderId,
  ProviderConnection,
  ProviderConnectionMethod,
} from "../src/platform/desktop/contracts";

type StoredProviderConnection = {
  id: GitProviderId;
  providerId: GitProviderId;
  method: ProviderConnectionMethod;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
  createdAt: string;
  updatedAt: string;
  encryptedToken: string;
  authType?: ProviderAuthType;
  identifier?: string | null;
};

export type ProviderConnectionSecret = ProviderConnection & {
  token: string;
  authType: ProviderAuthType;
  identifier: string | null;
};

const PROVIDER_CONNECTIONS_FILE_NAME = "provider-connections.json";

function resolveProviderConnectionsPath() {
  return path.join(app.getPath("userData"), PROVIDER_CONNECTIONS_FILE_NAME);
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

function assertEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Secure credential storage is unavailable on this machine.");
  }
}

function stripSecret(connection: StoredProviderConnection): ProviderConnection {
  return {
    id: connection.id,
    providerId: connection.providerId,
    method: connection.method,
    login: connection.login,
    displayName: connection.displayName,
    avatarUrl: connection.avatarUrl,
    scopes: [...connection.scopes],
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function encryptToken(token: string) {
  assertEncryptionAvailable();
  return safeStorage.encryptString(token).toString("base64");
}

function decryptToken(encryptedToken: string) {
  assertEncryptionAvailable();
  const buffer = Buffer.from(encryptedToken, "base64");
  return safeStorage.decryptString(buffer);
}

async function readStoredConnections(): Promise<StoredProviderConnection[]> {
  try {
    const raw = await fs.readFile(resolveProviderConnectionsPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is StoredProviderConnection => {
      return (
        typeof value === "object" &&
        value !== null &&
        typeof value.id === "string" &&
        typeof value.providerId === "string" &&
        typeof value.method === "string" &&
        typeof value.login === "string" &&
        typeof value.encryptedToken === "string"
      );
    });
  } catch (error) {
    if (isMissingFileError(error) || error instanceof SyntaxError) {
      return [];
    }

    throw error;
  }
}

async function writeStoredConnections(connections: StoredProviderConnection[]) {
  const connectionsPath = resolveProviderConnectionsPath();
  await fs.mkdir(path.dirname(connectionsPath), { recursive: true });
  await fs.writeFile(connectionsPath, JSON.stringify(connections, null, 2), "utf8");
}

export async function listProviderConnections(): Promise<ProviderConnection[]> {
  const connections = await readStoredConnections();
  return connections.map(stripSecret);
}

export async function getProviderConnection(
  providerId: GitProviderId,
): Promise<ProviderConnectionSecret | null> {
  const connections = await readStoredConnections();
  const connection = connections.find((value) => value.providerId === providerId);
  if (!connection) {
    return null;
  }

  const authType =
    connection.authType === "basic" || connection.authType === "bearer"
      ? connection.authType
      : providerId === "github"
        ? "bearer"
        : "basic";
  const identifier =
    typeof connection.identifier === "string" && connection.identifier.trim()
      ? connection.identifier.trim()
      : null;

  return {
    ...stripSecret(connection),
    token: decryptToken(connection.encryptedToken),
    authType,
    identifier,
  };
}

type SaveProviderConnectionInput = ConnectProviderInput & {
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  scopes: string[];
};

export async function saveProviderConnection(
  input: SaveProviderConnectionInput,
): Promise<ProviderConnection> {
  const now = new Date().toISOString();
  const connections = await readStoredConnections();
  const existing = connections.find((value) => value.providerId === input.providerId);

  const nextConnection: StoredProviderConnection = {
    id: input.providerId,
    providerId: input.providerId,
    method: input.method,
    login: input.login,
    displayName: input.displayName,
    avatarUrl: input.avatarUrl,
    scopes: [...input.scopes],
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    encryptedToken: encryptToken(input.token),
    authType:
      input.authType === "basic" || input.authType === "bearer"
        ? input.authType
        : existing?.authType ?? (input.providerId === "github" ? "bearer" : "basic"),
    identifier:
      input.identifier === null
        ? null
        : typeof input.identifier === "string" && input.identifier.trim()
          ? input.identifier.trim()
          : existing?.identifier ?? null,
  };

  const nextConnections = connections.filter((value) => value.providerId !== input.providerId);
  nextConnections.push(nextConnection);
  await writeStoredConnections(nextConnections);

  return stripSecret(nextConnection);
}

export async function deleteProviderConnection(providerId: GitProviderId): Promise<void> {
  const connections = await readStoredConnections();
  const nextConnections = connections.filter((value) => value.providerId !== providerId);

  if (nextConnections.length === connections.length) {
    return;
  }

  await writeStoredConnections(nextConnections);
}
