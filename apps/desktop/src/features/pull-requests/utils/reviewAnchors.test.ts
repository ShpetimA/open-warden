import { describe, expect, it } from "vitest";

import type { CommentItem } from "@/features/source-control/types";
import type { PullRequestChangedFile, PullRequestReviewThread } from "@/platform/desktop";

import { buildPullRequestReviewAnchors } from "./reviewAnchors";

function createFile(overrides: Partial<PullRequestChangedFile> = {}): PullRequestChangedFile {
  return {
    path: overrides.path ?? "src/example.ts",
    previousPath: overrides.previousPath ?? null,
    status: overrides.status ?? "modified",
    additions: overrides.additions ?? 3,
    deletions: overrides.deletions ?? 1,
  };
}

function createThread(overrides: Partial<PullRequestReviewThread> = {}): PullRequestReviewThread {
  return {
    id: overrides.id ?? "thread-1",
    path: overrides.path ?? "src/example.ts",
    line: overrides.line ?? 12,
    startLine: overrides.startLine ?? 12,
    diffSide: overrides.diffSide ?? "RIGHT",
    isResolved: overrides.isResolved ?? false,
    isOutdated: overrides.isOutdated ?? false,
    resolvedBy: overrides.resolvedBy ?? null,
    comments: overrides.comments ?? [
      {
        id: "comment-1",
        databaseId: 1,
        body: "Remote thread",
        createdAt: "2024-01-01T10:00:00Z",
        updatedAt: "2024-01-01T10:00:00Z",
        author: null,
        path: overrides.path ?? "src/example.ts",
        line: overrides.line ?? 12,
        startLine: overrides.startLine ?? 12,
        url: null,
      },
    ],
  };
}

function createDraft(overrides: Partial<CommentItem> = {}): CommentItem {
  return {
    type: "annotation",
    id: overrides.id ?? "1710000000000-a1",
    repoPath: overrides.repoPath ?? "/repo/a",
    filePath: overrides.filePath ?? "src/example.ts",
    bucket: overrides.bucket ?? "unstaged",
    startLine: overrides.startLine ?? 12,
    endLine: overrides.endLine ?? 12,
    side: overrides.side ?? "additions",
    endSide: overrides.endSide,
    text: overrides.text ?? "Pending draft",
    contextKind: overrides.contextKind ?? "review",
    baseRef: overrides.baseRef ?? "main",
    headRef: overrides.headRef ?? "feature",
  };
}

describe("reviewAnchors", () => {
  it("groups remote threads and pending drafts by the same strict anchor key", () => {
    const result = buildPullRequestReviewAnchors({
      files: [createFile()],
      reviewThreads: [createThread({ id: "thread-1" })],
      pendingDrafts: [createDraft({ id: "1710000000000-a1" })],
    });

    expect(result.allAnchors).toHaveLength(1);
    expect(result.allAnchors[0]).toEqual(
      expect.objectContaining({
        path: "src/example.ts",
        startLine: 12,
        endLine: 12,
        side: "additions",
      }),
    );
    expect(result.allAnchors[0].remoteThreads.map((thread) => thread.id)).toEqual(["thread-1"]);
    expect(result.allAnchors[0].pendingDrafts.map((draft) => draft.id)).toEqual([
      "1710000000000-a1",
    ]);
  });

  it("keeps multiple pending drafts on the same anchor as separate items ordered oldest first", () => {
    const result = buildPullRequestReviewAnchors({
      files: [createFile()],
      reviewThreads: [],
      pendingDrafts: [
        createDraft({ id: "1710000000002-a2" }),
        createDraft({ id: "1710000000001-a1" }),
      ],
    });

    expect(result.allAnchors).toHaveLength(1);
    expect(result.allAnchors[0].pendingDrafts.map((draft) => draft.id)).toEqual([
      "1710000000001-a1",
      "1710000000002-a2",
    ]);
  });

  it("indexes anchors by current file path for renamed files", () => {
    const result = buildPullRequestReviewAnchors({
      files: [createFile({ path: "src/new-name.ts", previousPath: "src/old-name.ts" })],
      reviewThreads: [createThread({ path: "src/old-name.ts", id: "thread-1" })],
      pendingDrafts: [createDraft({ filePath: "src/new-name.ts", id: "1710000000000-a1" })],
    });

    expect(result.anchorsByFile["src/new-name.ts"]).toHaveLength(1);
    expect(result.anchorsByFile["src/new-name.ts"][0].previousPath).toBe("src/old-name.ts");
  });

  it("keeps remote-only anchors out of the pending section", () => {
    const result = buildPullRequestReviewAnchors({
      files: [createFile()],
      reviewThreads: [createThread({ id: "thread-1" })],
      pendingDrafts: [],
    });

    expect(result.pendingAnchors).toHaveLength(0);
    expect(result.remoteAnchors.map((anchor) => anchor.remoteThreads[0]?.id)).toEqual(["thread-1"]);
  });
});
