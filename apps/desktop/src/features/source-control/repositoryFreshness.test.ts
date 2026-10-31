import { expect, test } from "vitest";
import { repositoryChangeTags } from "./repositoryFreshness";
import { repositoryChangeSchema } from "@/platform/desktop/repositoryEvents";

test("ordinary file edits refresh only snapshot and the affected working versions", () => {
  const change = repositoryChangeSchema.parse({
    repoPath: "/repo",
    kinds: ["worktree"],
    paths: ["a.ts"],
    structure: false,
  });
  expect(repositoryChangeTags(change)).toEqual([
    { type: "Snapshot", id: "/repo" },
    { type: "FileVersions", id: "/repo:a.ts" },
    { type: "FileVersions", id: "file:/repo:worktree:a.ts" },
  ]);
});

test("index changes refresh working versions and file membership without refetching immutable history", () => {
  expect(
    repositoryChangeTags({ repoPath: "/repo", kinds: ["index"], paths: [], structure: false }),
  ).toEqual([
    { type: "Snapshot", id: "/repo" },
    { type: "RepoFiles", id: "/repo" },
    { type: "RepositoryState", id: "/repo" },
    { type: "WorkingVersions", id: "/repo" },
  ]);
});

test("ref changes invalidate mutable comparisons and history only within the changed repository", () => {
  const tags = repositoryChangeTags({
    repoPath: "/linked",
    kinds: ["refs"],
    paths: [],
    structure: false,
  });
  expect(tags.map((tag) => tag.type)).toEqual([
    "Snapshot",
    "RepositoryState",
    "Branches",
    "HistoryCommits",
    "ComparedFiles",
    "ComparisonVersions",
    "WorkingVersions",
  ]);
  expect(tags.every((tag) => tag.id === "/linked")).toBe(true);
});
