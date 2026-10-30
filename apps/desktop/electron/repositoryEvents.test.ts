import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, rename } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { RepositoryEvents } from "./repositoryEvents";
import { updateWorktreeFileContents } from "./fileEdits";
import { runGitCommand } from "./gitOperations";
import { repositoryWriteEvents, repositoryTemporaryFileName } from "./repositoryChangeDefinitions";
import { coordinateRepositoryWrite } from "./repositoryWrites";
import { desktopSuccess } from "../src/platform/desktop/failure";
import type { RepositoryChange } from "../src/platform/desktop/repositoryEvents";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).toReversed()) await dispose();
});
function git(repo: string, args: string[]) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "warden-events-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const repo = path.join(directory, "repo");
  await mkdir(repo);
  git(repo, ["init"]);
  git(repo, ["config", "user.name", "Test"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  await writeFile(path.join(repo, ".gitignore"), "node_modules/\nbuild/\n");
  await writeFile(path.join(repo, "file.txt"), "initial\n");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-m", "initial"]);
  const events: RepositoryChange[] = [];
  const waiters = new Set<() => void>();
  const manager = new RepositoryEvents((event) => {
    events.push(event);
    for (const wake of waiters) wake();
  });
  cleanup.push(() => manager.dispose());
  const waitFor = (predicate: (event: RepositoryChange) => boolean) =>
    new Promise<RepositoryChange>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiters.delete(check);
        reject(
          new Error(
            `Repository event was not received: ${predicate.toString()}; observed ${JSON.stringify(events)}`,
          ),
        );
      }, 8000);
      const check = () => {
        const event = events.find(predicate);
        if (event) {
          clearTimeout(timer);
          waiters.delete(check);
          resolve(event);
        }
      };
      waiters.add(check);
      check();
    });
  return { directory, repo, manager, events, waitFor };
}

test("observes external writes, atomic saves, empty directories, new files and deletion without traversing ignored trees", async () => {
  const f = await fixture();
  await mkdir(path.join(f.repo, "empty", "nested"), { recursive: true });
  await mkdir(path.join(f.repo, "node_modules", "dependency"), { recursive: true });
  await writeFile(path.join(f.repo, "node_modules/dependency/index.js"), "ignored");
  expect((await f.manager.setSubscriptions([f.repo])).ok).toBe(true);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  await writeFile(path.join(f.repo, "node_modules/dependency/index.js"), "changed ignored");
  await writeFile(path.join(f.repo, ".git/COMMIT_EDITMSG"), "editing a commit message");
  await writeFile(path.join(f.repo, "file.txt"), "changed\n");
  const edit = await f.waitFor((event) => event.paths.includes("file.txt"));
  expect(edit.structure).toBe(false);
  expect(edit.kinds).toEqual(["worktree"]);
  expect(
    f.events.flatMap((event) => event.paths).some((file) => file.includes("node_modules/")),
  ).toBe(false);
  f.events.length = 0;
  await writeFile(path.join(f.repo, "empty/nested/new.txt"), "new");
  expect(
    (
      await f.waitFor(
        (event) =>
          event.kinds.includes("worktree") &&
          event.structure &&
          (!event.paths.length || event.paths.includes("empty/nested/new.txt")),
      )
    ).structure,
  ).toBe(true);
  f.events.length = 0;
  const temporary = repositoryTemporaryFileName("atomic-save");
  await writeFile(path.join(f.repo, temporary), "atomic");
  await rename(path.join(f.repo, temporary), path.join(f.repo, "file.txt"));
  await f.waitFor((event) => event.paths.includes("file.txt"));
  expect(f.events.flatMap((event) => event.paths)).not.toContain(temporary);
  f.events.length = 0;
  await rm(path.join(f.repo, "file.txt"));
  expect(
    (
      await f.waitFor(
        (event) =>
          event.kinds.includes("worktree") &&
          event.structure &&
          (!event.paths.length || event.paths.includes("file.txt")),
      )
    ).structure,
  ).toBe(true);
}, 30000);

test("observes external index and refs and fans shared refs out to linked worktrees", async () => {
  const f = await fixture();
  const linked = path.join(f.directory, "linked");
  git(f.repo, ["worktree", "add", "-b", "linked", linked]);
  await f.manager.setSubscriptions([f.repo, linked]);
  await f.waitFor((event) => event.repoPath === linked && event.kinds.includes("refs"));
  f.events.length = 0;
  await writeFile(path.join(linked, "file.txt"), "linked\n");
  git(linked, ["add", "file.txt"]);
  await f.waitFor((event) => event.repoPath === linked && event.kinds.includes("index"));
  expect(f.events.some((event) => event.repoPath === f.repo && event.kinds.includes("index"))).toBe(
    false,
  );
  f.events.length = 0;
  git(linked, ["commit", "-m", "linked commit"]);
  await f.waitFor((event) => event.repoPath === linked && event.kinds.includes("refs"));
  await f.waitFor((event) => event.repoPath === f.repo && event.kinds.includes("refs"));
}, 30000);

test("coalesces partial mutation failures and stops delivery when unsubscribed", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  const result = await coordinateRepositoryWrite(
    f.repo,
    repositoryWriteEvents.discardFiles,
    async () => {
      await writeFile(path.join(f.repo, "file.txt"), "partially changed");
      throw new Error("Second file failed");
    },
  );
  expect(result.ok).toBe(false);
  await f.waitFor((event) => event.kinds.includes("index") && event.kinds.includes("worktree"));
  await f.manager.setSubscriptions([]);
  f.events.length = 0;
  await coordinateRepositoryWrite(f.repo, repositoryWriteEvents.commitStaged, async () =>
    desktopSuccess("noop"),
  );
  // A subsequent subscribed repository event is a real flush barrier, not a fixed sleep.
  const other = await fixture();
  await other.manager.setSubscriptions([other.repo]);
  await other.waitFor((event) => event.kinds.includes("refs"));
  expect(f.events).toEqual([]);
}, 30000);

test("reattaches after repository root replacement and observes the new index and files", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  await rename(f.repo, path.join(f.directory, "old-repo"));
  await f.waitFor((event) => !!event.failure);
  await mkdir(f.repo);
  git(f.repo, ["init"]);
  git(f.repo, ["config", "user.name", "Test"]);
  git(f.repo, ["config", "user.email", "test@example.com"]);
  await writeFile(path.join(f.repo, "replacement.txt"), "replacement\n");
  git(f.repo, ["add", "."]);
  git(f.repo, ["commit", "-m", "replacement"]);
  await f.waitFor((event) => !event.failure && event.kinds.includes("refs"));
  // Synchronization is also the focus/reconnect barrier: it waits for attachment to finish.
  await f.manager.setSubscriptions([f.repo]);
  f.events.length = 0;
  await writeFile(path.join(f.repo, "replacement.txt"), "new edit\n");
  // Root replacement may coalesce this edit into a full membership refresh.
  await f.waitFor(
    (event) =>
      event.kinds.includes("worktree") &&
      (!event.paths.length || event.paths.includes("replacement.txt")),
  );
  f.events.length = 0;
  git(f.repo, ["add", "."]);
  await f.waitFor((event) => event.kinds.includes("index"));
}, 30000);

test("ignore-rule changes reconcile newly visible directories", async () => {
  const f = await fixture();
  await mkdir(path.join(f.repo, "build", "nested"), { recursive: true });
  await writeFile(path.join(f.repo, "build/nested/output.txt"), "ignored");
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  await writeFile(path.join(f.repo, ".gitignore"), "node_modules/\n");
  await f.waitFor((event) => event.kinds.includes("config"));
  await f.manager.setSubscriptions([f.repo]);
  f.events.length = 0;
  await writeFile(path.join(f.repo, "build/nested/output.txt"), "visible");
  await f.waitFor((event) => event.paths.includes("build/nested/output.txt"));
}, 30000);

test("native save completion identifies the changed path and failed fetch does not invalidate working files", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  expect(
    (
      await updateWorktreeFileContents(f.repo, "file.txt", "saved\n", {
        kind: "worktree",
        contents: "initial\n",
      })
    ).ok,
  ).toBe(true);
  const saved = await f.waitFor((event) => event.paths.includes("file.txt"));
  expect(saved.kinds).toEqual(["worktree"]);
  expect(saved.structure).toBe(false);
  f.events.length = 0;
  expect((await runGitCommand(f.repo, { kind: "fetch", remote: "missing" })).ok).toBe(false);
  const fetched = await f.waitFor((event) => event.kinds.includes("refs"));
  expect(fetched.kinds).toEqual(["refs"]);
  expect(fetched.structure).toBe(false);
}, 30000);

test("branch names matching Git metadata filenames remain ref changes", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));

  for (const branch of ["index", "config", "logs"]) {
    await f.manager.setSubscriptions([f.repo]);
    f.events.length = 0;
    git(f.repo, ["branch", branch]);
    const changed = await f.waitFor((event) => event.kinds.includes("refs"));
    expect(changed.kinds).toEqual(["refs"]);
    expect(changed.structure).toBe(false);
  }
}, 30000);

test("membership changes observed during reconciliation still publish a structural refresh", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;

  const reconciling = f.manager.setSubscriptions([f.repo]);
  await mkdir(path.join(f.repo, "new-directory"));
  await writeFile(path.join(f.repo, "new-directory/new.txt"), "created during reconciliation");
  await reconciling;
  await f.waitFor((event) => event.structure && event.kinds.includes("worktree"));
}, 30000);

test("watches force-tracked files inside ignored directories without reporting ignored siblings", async () => {
  const f = await fixture();
  await mkdir(path.join(f.repo, "build", "tracked"), { recursive: true });
  await mkdir(path.join(f.repo, "build", "ignored"), { recursive: true });
  await writeFile(path.join(f.repo, "build/tracked/file.txt"), "tracked\n");
  await writeFile(path.join(f.repo, "build/ignored/output.txt"), "ignored\n");
  git(f.repo, ["add", "-f", "build/tracked/file.txt"]);
  git(f.repo, ["commit", "-m", "Force tracked build file"]);
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  await writeFile(path.join(f.repo, "build/ignored/output.txt"), "changed ignored\n");
  await writeFile(path.join(f.repo, "build/tracked/file.txt"), "changed tracked\n");
  await f.waitFor((event) => event.paths.includes("build/tracked/file.txt"));
  expect(f.events.filter((event) => event.failure)).toEqual([]);
  expect(f.events.flatMap((event) => event.paths)).not.toContain("build/ignored/output.txt");
}, 30000);

test("a repository reopened during asynchronous release keeps its new subscription", async () => {
  const f = await fixture();
  await f.manager.setSubscriptions([f.repo]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  const closed = f.manager.setSubscriptions([]);
  const reopened = f.manager.setSubscriptions([f.repo]);
  await Promise.all([closed, reopened]);
  await f.waitFor((event) => event.kinds.includes("refs"));
  f.events.length = 0;
  await writeFile(path.join(f.repo, "file.txt"), "edited after reopening\n");
  await f.waitFor((event) => event.paths.includes("file.txt"));
  expect(f.events.filter((event) => event.failure)).toEqual([]);
}, 30000);
