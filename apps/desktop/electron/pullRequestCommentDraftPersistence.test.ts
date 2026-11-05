import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";

import {
  pullRequestCommentDraftChanged,
  pullRequestCommentDraftsRestored,
  pullRequestCommentDraftsReducer,
  selectPullRequestCommentDraft,
  selectPullRequestCommentPosting,
} from "../src/features/pull-requests/pullRequestCommentDraftsSlice";
import {
  createWorkspaceSession,
  storedWorkspaceSessionSchema,
} from "../src/platform/desktop/workspaceSession";
import { createAtomicJsonStore } from "./atomicJsonStore";

test("atomic workspace persistence restores independent PR comment drafts without replaying posts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "warden-pr-comment-drafts-"));

  try {
    const first = { repoPath: "/repo", pullRequestNumber: 42, body: "First unfinished comment" };
    const second = { repoPath: "/repo", pullRequestNumber: 43, body: "Different PR" };
    const other = { repoPath: "/other", pullRequestNumber: 42, body: "Different repository" };
    let state = pullRequestCommentDraftsReducer(undefined, pullRequestCommentDraftChanged(first));
    state = pullRequestCommentDraftsReducer(state, pullRequestCommentDraftChanged(second));
    state = pullRequestCommentDraftsReducer(state, pullRequestCommentDraftChanged(other));

    const file = path.join(directory, "session.json");
    const storage = createAtomicJsonStore({
      file,
      schema: storedWorkspaceSessionSchema,
      empty: createWorkspaceSession,
      operation: "workspaceSession",
    });
    const written = await storage.write({
      openRepos: ["/repo"],
      activeRepo: "/repo",
      recentRepos: [],
      pullRequestCommentDrafts: state.drafts,
    });
    expect(written.ok).toBe(true);

    const loaded = await storage.read();
    if (!loaded.ok) throw new Error("Saved PR comment drafts must load");
    const session = createWorkspaceSession(loaded.value.data);
    const restored = pullRequestCommentDraftsReducer(
      undefined,
      pullRequestCommentDraftsRestored(session.pullRequestCommentDrafts ?? []),
    );
    const root = { pullRequestCommentDrafts: restored };

    expect(selectPullRequestCommentDraft(root, first)).toBe(first.body);
    expect(selectPullRequestCommentDraft(root, second)).toBe(second.body);
    expect(selectPullRequestCommentDraft(root, other)).toBe(other.body);
    expect(selectPullRequestCommentPosting(root, first)).toBe(false);
    expect(await readFile(file, "utf8")).not.toContain('"pending"');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
