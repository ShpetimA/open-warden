import { randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app } from "electron";
import { z } from "zod";
import * as hosted from "../hostedRepos";
import { getBranchFileVersions } from "../git";
import { loadWorkspaceSession } from "../workspaceSession";
import {
  guidanceFailure,
  type GuidanceResult,
  type GuidanceConnection,
  type GuidanceNavigate,
} from "../../src/platform/desktop/guidance";
import { GuidanceService } from "./service";
import { GuidanceStore } from "./store";
import { startGuidanceMcpServer } from "./mcpServer";

const preferencesSchema = z.object({ enabled: z.boolean(), token: z.string().min(32) });
let service: GuidanceService | undefined;
let connection: GuidanceConnection = {
  status: "stopped",
  endpoint: null,
  clientConfig: null,
  error: null,
};
let running: { close(): Promise<void> } | undefined;
let pending: Promise<void> = Promise.resolve();
let onShow: (target: GuidanceNavigate) => void = () => {};

function preferencesPath() {
  return path.join(app.getPath("userData"), "guidance-mcp.json");
}

function getService() {
  service ??= new GuidanceService({
    store: new GuidanceStore(path.join(app.getPath("userData"), "guidance")),
    loadWorkspaceSession,
    resolveHostedRepo: hosted.resolveHostedRepo,
    getPullRequestConversation: hosted.getPullRequestConversation,
    getPullRequestFiles: hosted.getPullRequestFiles,
    getPullRequestChecks: hosted.getPullRequestChecks,
    preparePullRequestCompareRefs: hosted.preparePullRequestCompareRefs,
    getBranchFileVersions,
    now: () => new Date().toISOString(),
    id: randomUUID,
    show: (target) => onShow(target),
  });
  return service;
}

async function readPreferences(): Promise<GuidanceResult<z.infer<typeof preferencesSchema>>> {
  try {
    const parsed = preferencesSchema.safeParse(
      JSON.parse(await fs.readFile(preferencesPath(), "utf8")),
    );
    if (!parsed.success)
      return guidanceFailure("storage", "The saved agent connection settings are invalid.");
    return { ok: true, value: parsed.data };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { ok: true, value: { enabled: false, token: randomBytes(32).toString("hex") } };
    }
    return guidanceFailure("storage", "The saved agent connection settings could not be read.");
  }
}

async function writePreferences(
  value: z.infer<typeof preferencesSchema>,
): Promise<GuidanceResult<void>> {
  const temporary = `${preferencesPath()}.tmp`;
  try {
    await fs.mkdir(path.dirname(preferencesPath()), { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
    await fs.rename(temporary, preferencesPath());
    return { ok: true, value: undefined };
  } catch {
    return guidanceFailure("storage", "The agent connection settings could not be saved.");
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

function changeConnection(enabled: boolean): Promise<GuidanceConnection> {
  const operation = pending.then(async () => {
    try {
      const saved = await readPreferences();
      if (!saved.ok) {
        connection = {
          status: "error",
          endpoint: null,
          clientConfig: null,
          error: saved.error.message,
        };
        return connection;
      }
      const preferences = saved.value;
      if (enabled) {
        if (running) return connection;
        const started = await startGuidanceMcpServer(getService(), {
          token: preferences.token,
          port: 47781,
        });
        if (!started.ok) {
          connection = {
            status: "error",
            endpoint: null,
            clientConfig: null,
            error: started.error.message,
          };
          return connection;
        }
        running = started.value;
        connection = {
          status: "running",
          endpoint: started.value.endpoint,
          error: null,
          clientConfig: JSON.stringify(
            {
              mcpServers: {
                "open-warden": {
                  type: "http",
                  url: started.value.endpoint,
                  headers: { Authorization: `Bearer ${preferences.token}` },
                },
              },
            },
            null,
            2,
          ),
        };
      } else {
        await running?.close();
        service?.clearActivities();
        running = undefined;
        connection = { status: "stopped", endpoint: null, clientConfig: null, error: null };
      }
      const written = await writePreferences({ ...preferences, enabled });
      if (!written.ok) {
        await running?.close();
        running = undefined;
        connection = {
          status: "error",
          endpoint: null,
          clientConfig: null,
          error: written.error.message,
        };
      }
    } catch {
      await running?.close();
      running = undefined;
      connection = {
        status: "error",
        endpoint: null,
        clientConfig: null,
        error: "The agent connection settings could not be saved.",
      };
    }
    return connection;
  });
  pending = operation.then(
    () => {},
    () => {},
  );
  return operation;
}

export const getPullRequestGuidance = (input: unknown) => getService().read(input);
export const getGuidanceActivity = (input: unknown) => getService().activity(input);
export const clearGuidanceMessages = (input: unknown) => getService().clearMessages(input);
export const setGuidanceProgress = (input: unknown) => getService().progress(input);
export const addGuidanceMessage = (input: unknown) => getService().message(input, "user");
export const getGuidanceConnection = async () => connection;
export const startGuidanceConnection = () => changeConnection(true);
export const stopGuidanceConnection = () => changeConnection(false);

export function configureGuidanceNavigation(listener: (target: GuidanceNavigate) => void) {
  onShow = listener;
}

export async function initializeGuidanceConnection() {
  const saved = await readPreferences();
  if (!saved.ok)
    connection = {
      status: "error",
      endpoint: null,
      clientConfig: null,
      error: saved.error.message,
    };
  else if (saved.value.enabled) await startGuidanceConnection();
}

export async function disposeGuidanceConnection() {
  await pending;
  await running?.close();
  running = undefined;
  service?.clearActivities();
}
