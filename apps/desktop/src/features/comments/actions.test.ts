import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  setActivePath,
  setActiveRepo,
  sourceControlReducer,
} from "@/features/source-control/sourceControlSlice";
import type { CommentItem } from "@/features/source-control/types";
import {
  clearLastCopiedPayload,
  commentsClipboardReducer,
  setLastCopiedPayload,
} from "@/features/comments/commentsClipboardSlice";
import { copyComments, copyLastCommentsPayload } from "@/features/comments/actions";
import { commentsReducer } from "@/features/comments/commentsSlice";

type TestStore = ReturnType<typeof createTestStore>;

function createComment(overrides: Partial<CommentItem>): CommentItem {
  return {
    type: "annotation",
    id: overrides.id ?? "comment-1",
    repoPath: overrides.repoPath ?? "/repo/a",
    filePath: overrides.filePath ?? "src/file.ts",
    bucket: overrides.bucket ?? "unstaged",
    startLine: overrides.startLine ?? 1,
    endLine: overrides.endLine ?? 1,
    side: overrides.side ?? "additions",
    endSide: overrides.endSide,
    text: overrides.text ?? "comment text",
    contextKind: overrides.contextKind,
    baseRef: overrides.baseRef,
    headRef: overrides.headRef,
  };
}

function createTestStore(comments: CommentItem[] = []) {
  const store = configureStore({
    reducer: {
      sourceControl: sourceControlReducer,
      comments: commentsReducer,
      commentsClipboard: commentsClipboardReducer,
    },
    preloadedState: {
      comments,
    },
  });

  store.dispatch(setActiveRepo("/repo/a"));
  store.dispatch(setActivePath("src/file.ts"));

  return store;
}

function mockClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
}

function commentIds(store: TestStore): string[] {
  return store.getState().comments.map((comment) => comment.id);
}

describe("comments actions", () => {
  beforeEach(() => {
    mockClipboard(vi.fn().mockResolvedValue(undefined));
  });

  it("copies file comments, clears copied comments, and stores last payload", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const store = createTestStore([
      createComment({ id: "c1", filePath: "src/file.ts", text: "first", startLine: 2, endLine: 4 }),
      createComment({ id: "c2", filePath: "src/other.ts", text: "second" }),
      createComment({ id: "c3", repoPath: "/repo/b", filePath: "src/file.ts", text: "third" }),
    ]);

    const result = await store.dispatch(
      copyComments("file", {
        context: { kind: "changes" },
        activePath: "src/file.ts",
      }),
    );

    expect(result).toEqual({ ok: true, copiedCount: 1, clearedCount: 1 });
    expect(writeText).toHaveBeenCalledWith("@src/file.ts#L2-4 - first");
    expect(commentIds(store)).toEqual(["c2", "c3"]);
    expect(store.getState().commentsClipboard.lastCopiedPayload).toBe("@src/file.ts#L2-4 - first");
  });

  it("copies all comments for matching review context only", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const store = createTestStore([
      createComment({
        id: "c1",
        filePath: "src/file.ts",
        text: "match",
        contextKind: "review",
        baseRef: "main",
        headRef: "feature/a",
      }),
      createComment({
        id: "c2",
        filePath: "src/file.ts",
        text: "different pair",
        contextKind: "review",
        baseRef: "main",
        headRef: "feature/b",
      }),
      createComment({
        id: "c3",
        filePath: "src/file.ts",
        text: "changes context",
        contextKind: "changes",
      }),
    ]);

    const result = await store.dispatch(
      copyComments("all", {
        context: { kind: "review", baseRef: "main", headRef: "feature/a" },
      }),
    );

    expect(result).toEqual({ ok: true, copiedCount: 1, clearedCount: 1 });
    expect(writeText).toHaveBeenCalledWith("@src/file.ts#L1 - match");
    expect(commentIds(store)).toEqual(["c2", "c3"]);
  });

  it("keeps comments and payload unchanged when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    mockClipboard(writeText);
    const store = createTestStore([
      createComment({ id: "c1", filePath: "src/file.ts", text: "first" }),
      createComment({ id: "c2", filePath: "src/other.ts", text: "second" }),
    ]);
    store.dispatch(setLastCopiedPayload("old payload"));

    const result = await store.dispatch(copyComments("all", { context: { kind: "changes" } }));

    expect(result).toEqual({ ok: false, copiedCount: 0, clearedCount: 0 });
    expect(commentIds(store)).toEqual(["c1", "c2"]);
    expect(store.getState().commentsClipboard.lastCopiedPayload).toBe("old payload");
  });

  it("copies last payload when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const store = createTestStore([createComment({ id: "c1", text: "kept comment" })]);
    store.dispatch(setLastCopiedPayload("stored payload"));

    const result = await store.dispatch(copyLastCommentsPayload());

    expect(result).toEqual({ ok: true });
    expect(writeText).toHaveBeenCalledWith("stored payload");
    expect(commentIds(store)).toEqual(["c1"]);
  });

  it("does not copy last payload when none is stored", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    mockClipboard(writeText);
    const store = createTestStore([createComment({ id: "c1" })]);
    store.dispatch(clearLastCopiedPayload());

    const result = await store.dispatch(copyLastCommentsPayload());

    expect(result).toEqual({ ok: false });
    expect(writeText).not.toHaveBeenCalled();
  });
});
