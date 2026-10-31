import { execFile } from "node:child_process";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { classifyDesktopFailure } from "./desktop-failure";
import { subscribeRepositoryWrites } from "./repositoryWrites";
import { getRepoFileListing } from "./git";
import {
  RepositoryWatchPool,
  type RepositoryWatchLease,
  type RepositoryFileEvent,
} from "./repositoryWatchPool";
import {
  gitMetadataPathChangeKinds,
  isRepositoryTemporaryFile,
  worktreeChangeKinds,
} from "./repositoryChangeDefinitions";
import {
  repositorySubscriptionsSchema,
  type RepositoryChange,
  type RepositoryChangeKind,
} from "../src/platform/desktop/repositoryEvents";
import { desktopSuccess, type DesktopResult } from "../src/platform/desktop/failure";

const execute = promisify(execFile);
const SETTLE_MS = 160;
const MAX_BATCH_MS = 800;
const RECOVERY_MS = 5000;
const MAX_EVENT_PATHS = 256;

type Repository = {
  requestedPath: string;
  root: string;
  gitDir: string;
  commonDir: string;
  watchers: Map<string, RepositoryWatchLease>;
  ignoredPaths: Set<string>;
  closing: Promise<void>;
  watchGeneration: number;
  entries: Map<string, "file" | "directory">;
  hints: Set<string>;
  checkingHints?: Promise<void>;
  kinds: Set<RepositoryChangeKind>;
  paths: Set<string>;
  structure: boolean;
  allPaths: boolean;
  timer?: ReturnType<typeof setTimeout>;
  deadline?: ReturnType<typeof setTimeout>;
  retry?: ReturnType<typeof setTimeout>;
  reconcile?: Promise<void>;
  reconcileAgain: boolean;
  disposed: boolean;
  ready: boolean;
};

async function git(repo: string, args: string[], input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "git",
      args,
      {
        cwd: repo,
        encoding: "utf8",
        timeout: 30_000,
        maxBuffer: 32 * 1024 * 1024,
      },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
    child.stdin?.on("error", reject);
    child.stdin?.end(input);
  });
}

export class RepositoryEvents {
  private readonly repositories = new Map<string, Repository>();
  private readonly unsubscribeWrites: () => void;
  private readonly identities = new WeakMap<RepositoryWatchLease, string>();
  private readonly watchPool = new RepositoryWatchPool();
  private desired = new Set<string>();
  private revision = 0;
  private disposed = false;

  constructor(private readonly publish: (event: RepositoryChange) => void) {
    this.unsubscribeWrites = subscribeRepositoryWrites(({ repoPath, commonDir, impact }) => {
      const { kinds, paths, structure } = impact;
      for (const repo of this.repositories.values()) {
        if (repo.commonDir !== commonDir) continue;
        const ownWorktree = path.resolve(repoPath) === repo.root || repoPath === repo.requestedPath;
        const affected = ownWorktree
          ? kinds
          : kinds.filter((kind) => kind === "refs" || kind === "config");
        if (affected.length) {
          if (ownWorktree && paths.length) {
            for (const file of paths) this.enqueue(repo, affected, file, structure);
          } else this.enqueue(repo, affected, undefined, ownWorktree && structure);
        }
      }
    });
  }

  async setSubscriptions(input: unknown): Promise<DesktopResult<void>> {
    const parsed = repositorySubscriptionsSchema.safeParse(input);
    if (!parsed.success)
      return {
        ok: false,
        error: classifyDesktopFailure(
          { code: "invalid-input", message: "Invalid repository subscriptions." },
          "watchRepositories",
        ),
      };
    const revision = ++this.revision;
    this.desired = new Set(parsed.data);
    for (const [key, repo] of this.repositories) {
      if (!this.desired.has(key)) {
        this.repositories.delete(key);
        await this.close(repo);
      }
    }
    for (const requested of this.desired) {
      if (this.disposed || revision !== this.revision) break;
      const existing = this.repositories.get(requested);
      if (existing) {
        await this.reconcile(existing);
        continue;
      }
      const repo: Repository = {
        requestedPath: requested,
        root: path.resolve(requested),
        gitDir: "",
        commonDir: "",
        watchers: new Map(),
        ignoredPaths: new Set(),
        closing: Promise.resolve(),
        watchGeneration: 0,
        entries: new Map(),
        hints: new Set(),
        kinds: new Set(),
        paths: new Set(),
        structure: false,
        allPaths: false,
        reconcileAgain: false,
        disposed: false,
        ready: false,
      };
      this.repositories.set(requested, repo);
      await this.reconcile(repo);
      if (!this.desired.has(requested) || this.disposed) {
        await this.close(repo);
        this.repositories.delete(requested);
      }
    }
    return desktopSuccess(undefined);
  }

  async dispose() {
    this.disposed = true;
    ++this.revision;
    this.desired.clear();
    this.unsubscribeWrites();
    const closing = [...this.repositories.values()].map((repo) => this.close(repo));
    this.repositories.clear();
    await Promise.all(closing);
  }

  private close(repo: Repository) {
    repo.disposed = true;
    clearTimeout(repo.timer);
    clearTimeout(repo.deadline);
    clearTimeout(repo.retry);
    this.releaseWatches(repo);
    return repo.closing;
  }

  private releaseWatches(repo: Repository) {
    repo.watchGeneration += 1;
    const closing = [...repo.watchers.values()].map((watcher) => watcher.close());
    repo.watchers.clear();
    repo.closing = Promise.allSettled([repo.closing, ...closing]).then(() => {});
  }

  private watchFailed(repo: Repository, cause: unknown) {
    if (repo.disposed) return;
    repo.ready = false;
    this.releaseWatches(repo);
    this.publish({
      repoPath: repo.requestedPath,
      kinds: [],
      paths: [],
      structure: false,
      failure: classifyDesktopFailure(cause, "watchRepository"),
    });
    clearTimeout(repo.retry);
    repo.retry = setTimeout(() => {
      repo.retry = undefined;
      void this.reconcile(repo);
    }, RECOVERY_MS);
  }

  private enqueue(
    repo: Repository,
    kinds: readonly RepositoryChangeKind[],
    relativePath?: string,
    structure = false,
  ) {
    if (repo.disposed) return;
    for (const kind of kinds) repo.kinds.add(kind);
    if (kinds.includes("worktree") && !relativePath) repo.allPaths = true;
    if (relativePath && repo.paths.size <= MAX_EVENT_PATHS) repo.paths.add(relativePath);
    repo.structure ||= structure;
    clearTimeout(repo.timer);
    repo.timer = setTimeout(() => this.flush(repo), SETTLE_MS);
    repo.deadline ??= setTimeout(() => this.flush(repo), MAX_BATCH_MS);
  }

  private flush(repo: Repository) {
    clearTimeout(repo.timer);
    clearTimeout(repo.deadline);
    repo.timer = undefined;
    repo.deadline = undefined;
    if (repo.disposed || !repo.kinds.size) return;
    const structure = repo.structure;
    const membershipPolicyChanged = repo.kinds.has("index") || repo.kinds.has("config");
    this.publish({
      repoPath: repo.requestedPath,
      kinds: [...repo.kinds],
      paths: repo.allPaths || repo.paths.size > MAX_EVENT_PATHS ? [] : [...repo.paths],
      structure,
    });
    repo.kinds.clear();
    repo.paths.clear();
    repo.structure = false;
    repo.allPaths = false;
    if (structure || membershipPolicyChanged) void this.reconcile(repo);
  }

  private reconcile(repo: Repository): Promise<void> {
    if (repo.disposed) return Promise.resolve();
    if (repo.reconcile) {
      repo.reconcileAgain = true;
      return repo.reconcile;
    }
    repo.reconcile = (async () => {
      do {
        repo.reconcileAgain = false;
        try {
          const attached = await this.attach(repo);
          if (!attached) return;
          if (!repo.ready && !repo.disposed) {
            repo.ready = true;
            this.enqueue(repo, ["worktree", "index", "refs", "config"], undefined, true);
          }
          clearTimeout(repo.retry);
          repo.retry = undefined;
        } catch (cause) {
          this.watchFailed(repo, cause);
          return;
        }
      } while (repo.reconcileAgain && !repo.disposed);
    })().finally(() => {
      repo.reconcile = undefined;
    });
    return repo.reconcile;
  }

  private checkWorktreeHint(repo: Repository, relative: string) {
    repo.hints.add(relative);
    if (repo.checkingHints) return;
    repo.checkingHints = (async () => {
      while (repo.hints.size && !repo.disposed) {
        const batch = [...repo.hints].slice(0, 64);
        for (const file of batch) repo.hints.delete(file);
        const unknown = batch.filter((file) => !repo.entries.has(file));
        let ignored = "";
        if (unknown.length) {
          try {
            ignored = await git(
              repo.root,
              ["check-ignore", "--stdin", "-z"],
              unknown.join("\0") + "\0",
            );
          } catch (cause) {
            if (!(cause instanceof Error && "code" in cause && cause.code === 1)) throw cause;
          }
        }
        const skipped = new Set(ignored.split("\0"));
        await Promise.all(
          batch.map(async (file) => {
            const before = repo.entries.get(file);
            let after: "file" | "directory" | undefined;
            try {
              after = (await lstat(path.join(repo.root, file))).isDirectory()
                ? "directory"
                : "file";
            } catch (cause) {
              if (!(cause instanceof Error && "code" in cause && cause.code === "ENOENT"))
                throw cause;
            }
            if (!before && !after) return;
            if (!before && skipped.has(file)) return;
            if (repo.disposed) return;
            if (after) repo.entries.set(file, after);
            else repo.entries.delete(file);
            this.enqueue(
              repo,
              worktreeChangeKinds(file),
              before === "directory" || after === "directory" ? undefined : file,
              before !== after,
            );
          }),
        );
      }
    })()
      .catch((cause) => {
        if (!repo.disposed)
          this.publish({
            repoPath: repo.requestedPath,
            kinds: [],
            paths: [],
            structure: false,
            failure: classifyDesktopFailure(cause, "watchRepository"),
          });
      })
      .finally(() => {
        repo.checkingHints = undefined;
        const next = repo.hints.values().next().value;
        if (next !== undefined && !repo.disposed) this.checkWorktreeHint(repo, next);
      });
  }

  private async attach(repo: Repository): Promise<boolean> {
    await repo.closing;
    const generation = repo.watchGeneration;
    const { stdout } = await execute(
      "git",
      [
        "rev-parse",
        "--show-toplevel",
        "--absolute-git-dir",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      { cwd: repo.requestedPath, timeout: 30_000 },
    );
    const [root, gitDir, commonDir] = stdout.trimEnd().split("\n");
    if (!root || !gitDir || !commonDir)
      throw new Error("Repository directories could not be resolved");
    [repo.root, repo.gitDir, repo.commonDir] = await Promise.all([
      realpath(root),
      realpath(gitDir),
      realpath(commonDir),
    ]);
    const directories = new Set<string>([repo.root]);
    const entries = new Map<string, "file" | "directory">();
    const listing = await getRepoFileListing(repo.root);
    repo.ignoredPaths = new Set(listing.ignoredPaths);
    for (const file of listing.files) {
      const directory = file.path.endsWith("/");
      const relative = directory ? file.path.slice(0, -1) : file.path;
      if (isRepositoryTemporaryFile(path.basename(relative))) continue;
      if (directory) directories.add(path.join(repo.root, relative));
      else entries.set(relative, "file");

      let parent = path.dirname(relative);
      while (parent !== ".") {
        directories.add(path.join(repo.root, parent));
        parent = path.dirname(parent);
      }
    }
    for (const directory of directories)
      entries.set(path.relative(repo.root, directory).split(path.sep).join("/"), "directory");
    const membershipChanged =
      repo.ready &&
      (entries.size !== repo.entries.size ||
        [...entries].some(([file, kind]) => repo.entries.get(file) !== kind));
    repo.entries = entries;
    if (membershipChanged) this.enqueue(repo, ["worktree"], undefined, true);

    const inside = (base: string, file: string) =>
      file === base || file.startsWith(base + path.sep);
    const metadataRoots = [repo.commonDir];
    if (!inside(repo.commonDir, repo.gitDir)) metadataRoots.push(repo.gitDir);
    const worktreeIgnores = [...repo.ignoredPaths].map((file) => path.join(repo.root, file));
    for (const directory of metadataRoots) {
      if (inside(repo.root, directory)) worktreeIgnores.push(directory);
    }
    const plans = [
      { directory: repo.root, parent: false, ignore: worktreeIgnores },
      ...metadataRoots.map((directory) => ({
        directory,
        parent: false,
        ignore: ["objects", "logs", "hooks", "rr-cache"].map((name) => path.join(directory, name)),
      })),
      { directory: path.dirname(repo.root), parent: true, ignore: [] },
    ];
    const desired = new Set(plans.map((plan) => plan.directory));
    if (repo.disposed || repo.watchGeneration !== generation) return false;
    for (const [directory, watcher] of repo.watchers) {
      if (!desired.has(directory)) {
        repo.watchers.delete(directory);
        await watcher.close();
      }
    }
    for (const plan of plans) {
      if (repo.disposed || repo.watchGeneration !== generation) return false;
      const stats = await lstat(plan.directory);
      const identity = JSON.stringify([stats.dev, stats.ino, plan.ignore.toSorted(), plan.parent]);
      const previous = repo.watchers.get(plan.directory);
      if (previous && this.identities.get(previous) === identity) continue;
      const receive = (error: unknown, events: readonly RepositoryFileEvent[]) => {
        if (repo.disposed || repo.watchGeneration !== generation) return;
        if (error) {
          this.watchFailed(repo, error);
          return;
        }
        for (const event of events) {
          const file = event.path;
          if (plan.parent) {
            if (file === repo.root || file === plan.directory)
              this.enqueue(repo, ["worktree", "index", "refs", "config"], undefined, true);
            continue;
          }
          if (file === plan.directory && event.type === "delete") {
            repo.ready = false;
            this.releaseWatches(repo);
            this.enqueue(repo, ["worktree", "index", "refs", "config"], undefined, true);
            return;
          }
          if (plan.directory !== repo.root) {
            const relative = path.relative(
              inside(repo.gitDir, file) ? repo.gitDir : repo.commonDir,
              file,
            );
            const kinds = gitMetadataPathChangeKinds(relative);
            if (kinds.length) this.enqueue(repo, kinds);
            continue;
          }
          if (isRepositoryTemporaryFile(path.basename(file))) continue;
          const relative = path.relative(repo.root, file).split(path.sep).join("/");
          if (relative === ".git") {
            this.enqueue(repo, ["index", "refs", "config"], undefined, true);
          } else if (!relative) {
            this.enqueue(repo, ["worktree"], undefined, true);
          } else this.checkWorktreeHint(repo, relative);
        }
      };
      // @parcel/watcher reuses an open subscription's directory scan for the same root. On Linux,
      // a replacement opened before the old watcher closes never watches newly unignored folders.
      // Close the old watcher first, then reread Git state to cover the short gap.
      if (previous) {
        repo.watchers.delete(plan.directory);
        await previous.close();
      }

      const watcher = plan.parent
        ? await this.watchPool.parentDirectory(plan.directory, receive)
        : await this.watchPool.recursiveRoot(plan.directory, plan.ignore, receive);
      if (repo.disposed || repo.watchGeneration !== generation) {
        await watcher.close();
        return false;
      }

      this.identities.set(watcher, identity);
      repo.watchers.set(plan.directory, watcher);
      if (previous) this.enqueue(repo, ["worktree", "index", "refs", "config"], undefined, true);
    }
    return true;
  }
}
