import type { FileTreeSortComparator } from "@pierre/trees";

import type { DisplayFile } from "./flatPierreTree";

export type ReviewFileView = "review" | "tree" | "list";

export const reviewFileGroups = ["Changes", "Tests", "Docs", "Generated"] as const;
export type ReviewFileGroup = (typeof reviewFileGroups)[number];

const generatedNames = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "cargo.lock",
  "go.sum",
  "composer.lock",
  "gemfile.lock",
  "poetry.lock",
  "uv.lock",
  "mix.lock",
  "packages.lock.json",
  "project.assets.json",
]);
const generatedDirectories = new Set([
  "__generated__",
  "__snapshots__",
  "node_modules",
  "dist",
  "build",
  "vendor",
  "coverage",
  "obj",
]);
const testDirectories = new Set(["__tests__", "test", "tests", "spec", "specs", "e2e", "cypress"]);
const docDirectories = new Set(["doc", "docs", "documentation", "api-docs"]);

export function getReviewFileGroup(path: string): ReviewFileGroup {
  const normalizedPath = path.replaceAll("\\", "/");
  const parts = normalizedPath.toLowerCase().split("/");
  const name = parts.at(-1) ?? "";
  const directories = parts.slice(0, -1);

  if (
    generatedNames.has(name) ||
    directories.some((directory) => generatedDirectories.has(directory)) ||
    /(?:\.snap|\.min\.(?:js|css)|\.g\.cs|\.designer\.cs|_pb2\.py)$/.test(name) ||
    /\.generated\./.test(name)
  )
    return "Generated";

  if (
    directories.some(
      (directory) => testDirectories.has(directory) || /[._-](?:tests?|specs?)$/.test(directory),
    ) ||
    /\.(?:test|spec)\./.test(name) ||
    /_(?:test|tests|spec)\.[^.]+$/.test(name) ||
    /^test_.+\.py$/.test(name) ||
    /(?:Tests?|Spec)\.(?:cs|java|kt|swift)$/.test(normalizedPath.split("/").at(-1) ?? "")
  )
    return "Tests";

  if (
    directories.some((directory) => docDirectories.has(directory)) ||
    /\.(?:md|mdx|markdown|rst|adoc)$/.test(name) ||
    /^(?:readme|changelog|contributing|license|licence)(?:\.|$)/.test(name)
  )
    return "Docs";

  return "Changes";
}

export function buildReviewDisplayFiles<TFile extends { path: string }>(
  files: readonly TFile[],
): DisplayFile<TFile>[] {
  return files.map((file) => ({
    path: `${getReviewFileGroup(file.path)}/${file.path}`,
    realPath: file.path,
    source: file,
  }));
}

function groupRank(path: string) {
  return reviewFileGroups.findIndex((group) => path === group || path.startsWith(`${group}/`));
}

function comparePathNames(left: string, right: string) {
  const naturalOrder = left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
  if (naturalOrder !== 0) return naturalOrder;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export const compareReviewFileEntries: FileTreeSortComparator = (left, right) => {
  const groupOrder = groupRank(left.path) - groupRank(right.path);
  if (groupOrder !== 0) return groupOrder;

  // Prepared trees require each directory's descendants to remain contiguous.
  const sharedDepth = Math.min(left.segments.length, right.segments.length);
  for (let depth = 0; depth < sharedDepth; depth += 1) {
    const leftSegment = left.segments[depth] ?? "";
    const rightSegment = right.segments[depth] ?? "";
    if (leftSegment === rightSegment) continue;

    const leftIsDirectory = left.isDirectory || depth < left.segments.length - 1;
    const rightIsDirectory = right.isDirectory || depth < right.segments.length - 1;
    if (leftIsDirectory !== rightIsDirectory) return leftIsDirectory ? -1 : 1;

    return comparePathNames(leftSegment, rightSegment);
  }

  return left.segments.length - right.segments.length;
};

export function compareReviewDirectories(left: { path: string }, right: { path: string }) {
  return groupRank(left.path) - groupRank(right.path) || comparePathNames(left.path, right.path);
}
