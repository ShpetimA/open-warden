import type { DiffEditExpectation, FileEditExpectation } from "@/platform/desktop/fileEdits";
import { desktop } from "@/platform/desktop";

import type { Bucket } from "../types";

type DiscardFileRequest = {
  relPath: string;
  bucket: Bucket;
};

export async function getGitSnapshot(repoPath: string) {
  return desktop.getGitSnapshot(repoPath);
}

export async function getRepoFiles(repoPath: string) {
  return desktop.getRepoFiles(repoPath);
}

export async function getCommitHistory(repoPath: string, limit?: number) {
  return desktop.getCommitHistory(repoPath, limit);
}

export async function getCommitDetails(repoPath: string, commitId: string) {
  return desktop.getCommitDetails(repoPath, commitId);
}

export async function getBranchCommits(repoPath: string, baseRef: string, headRef: string) {
  return desktop.getBranchCommits(repoPath, baseRef, headRef);
}

export async function getBranches(repoPath: string) {
  return desktop.getBranches(repoPath);
}

export async function getBranchFiles(repoPath: string, baseRef: string, headRef: string) {
  return desktop.getBranchFiles(repoPath, baseRef, headRef);
}

export async function getCommitFiles(repoPath: string, commitId: string) {
  return desktop.getCommitFiles(repoPath, commitId);
}

export async function getRepoFile(repoPath: string, relPath: string, revision?: string | null) {
  return desktop.getRepoFile({ repoPath, relPath, revision });
}

export async function getCommitFileVersions(
  repoPath: string,
  commitId: string,
  relPath: string,
  previousPath?: string,
) {
  return desktop.getCommitFileVersions(repoPath, commitId, relPath, previousPath);
}

export async function getFileVersions(repoPath: string, bucket: Bucket, relPath: string) {
  return desktop.getFileVersions(repoPath, relPath, bucket);
}

export async function getBranchFileVersions(
  repoPath: string,
  baseRef: string,
  headRef: string,
  relPath: string,
  previousPath?: string,
) {
  return desktop.getBranchFileVersions(repoPath, baseRef, headRef, relPath, previousPath);
}

export async function stageFile(repoPath: string, relPath: string) {
  return desktop.stageFile(repoPath, relPath);
}

export async function unstageFile(repoPath: string, relPath: string) {
  return desktop.unstageFile(repoPath, relPath);
}

export async function updateIndexFileContents(
  repoPath: string,
  relPath: string,
  contents: string,
  expected: DiffEditExpectation,
) {
  return desktop.updateIndexFileContents(repoPath, relPath, contents, expected);
}

export async function updateWorktreeFileContents(
  repoPath: string,
  relPath: string,
  contents: string,
  expected: FileEditExpectation,
) {
  return desktop.updateWorktreeFileContents(repoPath, relPath, contents, expected);
}

export async function discardFile(repoPath: string, relPath: string, bucket: Bucket) {
  return desktop.discardFile(repoPath, relPath, bucket);
}

export async function discardFiles(repoPath: string, files: DiscardFileRequest[]) {
  return desktop.discardFiles(repoPath, files);
}

export async function stageAll(repoPath: string) {
  return desktop.stageAll(repoPath);
}

export async function unstageAll(repoPath: string) {
  return desktop.unstageAll(repoPath);
}

export async function commitStaged(repoPath: string, message: string) {
  return desktop.commitStaged(repoPath, message);
}
