import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import type { AppThunk } from "@/app/store";
import type {
  PullRequestCommentDraft,
  PullRequestCommentTarget,
} from "@/platform/desktop/pullRequestCommentDrafts";

type CommentDraftState = {
  drafts: PullRequestCommentDraft[];
  pending: PullRequestCommentTarget[];
};

const initialState: CommentDraftState = { drafts: [], pending: [] };

function sameTarget(left: PullRequestCommentTarget, right: PullRequestCommentTarget) {
  return left.repoPath === right.repoPath && left.pullRequestNumber === right.pullRequestNumber;
}

const slice = createSlice({
  name: "pullRequestCommentDrafts",
  initialState,
  reducers: {
    pullRequestCommentDraftsRestored(
      state,
      { payload }: PayloadAction<readonly PullRequestCommentDraft[]>,
    ) {
      for (const draft of payload) {
        if (
          !draft.body ||
          state.drafts.some((current) => sameTarget(current, draft)) ||
          state.pending.some((current) => sameTarget(current, draft))
        ) {
          continue;
        }

        state.drafts.push(draft);
      }
    },
    pullRequestCommentDraftChanged(state, { payload }: PayloadAction<PullRequestCommentDraft>) {
      const existing = state.drafts.findIndex((draft) => sameTarget(draft, payload));

      if (!payload.body) {
        if (existing >= 0) state.drafts.splice(existing, 1);
      } else if (existing < 0) state.drafts.push(payload);
      else state.drafts[existing] = payload;
    },
    commentPostStarted(state, { payload }: PayloadAction<PullRequestCommentTarget>) {
      if (!state.pending.some((target) => sameTarget(target, payload))) state.pending.push(payload);
    },
    commentPostFinished(
      state,
      { payload }: PayloadAction<PullRequestCommentDraft & { posted: boolean }>,
    ) {
      state.pending = state.pending.filter((target) => !sameTarget(target, payload));

      if (payload.posted) {
        state.drafts = state.drafts.filter(
          (draft) => !sameTarget(draft, payload) || draft.body !== payload.body,
        );
      }
    },
  },
});

export const { pullRequestCommentDraftsRestored, pullRequestCommentDraftChanged } = slice.actions;
export const pullRequestCommentDraftsReducer = slice.reducer;

export function selectPullRequestCommentDraft(
  state: { pullRequestCommentDrafts: CommentDraftState },
  target: PullRequestCommentTarget,
) {
  return (
    state.pullRequestCommentDrafts.drafts.find((draft) => sameTarget(draft, target))?.body ?? ""
  );
}

export function selectPullRequestCommentPosting(
  state: { pullRequestCommentDrafts: CommentDraftState },
  target: PullRequestCommentTarget,
) {
  return state.pullRequestCommentDrafts.pending.some((pending) => sameTarget(pending, target));
}

export const postPullRequestCommentDraft =
  (
    target: PullRequestCommentTarget,
    post: (body: string) => Promise<boolean>,
  ): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const body = selectPullRequestCommentDraft(getState(), target);
    if (!body.trim() || selectPullRequestCommentPosting(getState(), target)) return;

    dispatch(slice.actions.commentPostStarted(target));
    let posted = false;

    try {
      posted = await post(body);
    } catch {
      posted = false;
    } finally {
      dispatch(slice.actions.commentPostFinished({ ...target, body, posted }));
    }
  };
