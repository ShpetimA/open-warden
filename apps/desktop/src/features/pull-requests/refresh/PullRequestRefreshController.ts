import { failureFromUnknown, type DesktopFailure } from "@/platform/desktop/failure";
import type { PullRequestLocatorInput } from "@/platform/desktop";

export type PullRequestRefreshState = Readonly<{
  busy: boolean;
  failure: DesktopFailure | null;
  retryAt: number;
  paused: boolean;
}>;
export const IDLE_REFRESH: PullRequestRefreshState = {
  busy: false,
  failure: null,
  retryAt: 0,
  paused: false,
};

const POLL_MS = 60_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export function automaticRefreshDelay(
  failures: readonly DesktopFailure[],
  attempts: number,
  now: number,
): number | null {
  if (
    failures.some((failure) =>
      ["authentication", "permission", "not-found", "invalid-input"].includes(failure.code),
    )
  )
    return null;
  if (!failures.length) return POLL_MS;
  return Math.max(
    Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** Math.min(attempts - 1, 4)),
    ...failures.map((failure) => (failure.retryAt ?? now) - now),
    0,
  );
}

type Entry = {
  locator: PullRequestLocatorInput;
  subscribers: number;
  listeners: Set<() => void>;
  state: PullRequestRefreshState;
  attempts: number;
  automaticAfter: number;
  cancel?: () => void;
  running?: Promise<void>;
};
export function pullRequestRefreshKey(locator: PullRequestLocatorInput) {
  return `${locator.repoPath}\0${locator.pullRequestNumber}`;
}

type RefreshRuntime = {
  now(): number;
  schedule(work: () => void | Promise<void>, delay: number): () => void;
  refresh(locator: PullRequestLocatorInput, manual: boolean): Promise<DesktopFailure[]>;
};

export class PullRequestRefreshController {
  private readonly runtime: RefreshRuntime;
  private readonly entries = new Map<string, Entry>();
  private disposed = false;

  constructor(runtime: RefreshRuntime) {
    this.runtime = runtime;
  }

  private entry(locator: PullRequestLocatorInput) {
    const key = pullRequestRefreshKey(locator);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        locator,
        subscribers: 0,
        listeners: new Set(),
        state: IDLE_REFRESH,
        attempts: 0,
        automaticAfter: 0,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  state(locator: PullRequestLocatorInput) {
    return this.entries.get(pullRequestRefreshKey(locator))?.state ?? IDLE_REFRESH;
  }

  subscribe(locator: PullRequestLocatorInput, listener: () => void) {
    const entry = this.entry(locator);
    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      this.prune(entry);
    };
  }

  retain(locator: PullRequestLocatorInput) {
    const entry = this.entry(locator);
    entry.subscribers += 1;
    if (!entry.cancel && !entry.running && !entry.state.paused) this.schedule(entry, POLL_MS);
    return () => {
      entry.subscribers -= 1;
      if (!entry.subscribers) {
        entry.cancel?.();
        entry.cancel = undefined;
        this.prune(entry);
      }
    };
  }

  private prune(entry: Entry) {
    if (!entry.subscribers && !entry.listeners.size && !entry.running)
      this.entries.delete(pullRequestRefreshKey(entry.locator));
  }

  private update(entry: Entry, state: PullRequestRefreshState) {
    if (this.disposed) return;
    entry.state = state;
    for (const listener of entry.listeners) listener();
  }

  private schedule(entry: Entry, delay: number) {
    entry.cancel?.();
    entry.cancel = this.runtime.schedule(
      () => {
        entry.cancel = undefined;
        return this.request(entry.locator, false);
      },
      Math.min(Math.max(delay, 0), 2_147_483_647),
    );
  }

  request(locator: PullRequestLocatorInput, manual = true): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const entry = this.entry(locator);
    if (entry.running) return entry.running;
    if (
      entry.state.retryAt > this.runtime.now() ||
      (!manual && (entry.state.paused || entry.automaticAfter > this.runtime.now()))
    )
      return Promise.resolve();
    entry.cancel?.();
    entry.cancel = undefined;
    this.update(entry, { ...entry.state, busy: true });
    entry.running = (async () => {
      let failures: DesktopFailure[];
      try {
        failures = await this.runtime.refresh(locator, manual);
      } catch (cause) {
        failures = [failureFromUnknown(cause, "refreshPullRequest")];
      }
      entry.attempts = failures.length ? entry.attempts + 1 : 0;
      const delay = automaticRefreshDelay(failures, entry.attempts, this.runtime.now());
      const retryAt = Math.max(0, ...failures.map((failure) => failure.retryAt ?? 0));
      entry.automaticAfter = failures.length && delay !== null ? this.runtime.now() + delay : 0;
      this.update(entry, {
        busy: false,
        failure: failures[0] ?? null,
        retryAt,
        paused: delay === null,
      });
      entry.running = undefined;
      if (!this.disposed && entry.subscribers && delay !== null) this.schedule(entry, delay);
      this.prune(entry);
    })();
    return entry.running;
  }

  recover() {
    for (const entry of this.entries.values())
      if (entry.subscribers) void this.request(entry.locator, false);
  }

  dispose() {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.cancel?.();
      entry.listeners.clear();
    }
    this.entries.clear();
  }
}
