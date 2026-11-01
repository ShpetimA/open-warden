import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

import { failureFromUnknown, type DesktopFailure } from "@/platform/desktop/failure";
import type { GitCommand } from "@/platform/desktop/gitOperations";
import { gitOperationsApi } from "./gitOperationsApi";

type CommandFeedback = {
  requestId: string;
  kind: GitCommand["kind"];
  error: DesktopFailure | null;
};

type State = { byRepository: Record<string, CommandFeedback | undefined> };
const initialState: State = { byRepository: {} };

const slice = createSlice({
  name: "gitCommandFeedback",
  initialState,
  reducers: {
    commandFailureDismissed(state, action: PayloadAction<{ repoPath: string; requestId: string }>) {
      const { repoPath, requestId } = action.payload;
      const current = state.byRepository[repoPath];

      if (current?.requestId === requestId && current.error) {
        delete state.byRepository[repoPath];
      }
    },
  },
  extraReducers(builder) {
    builder.addMatcher(gitOperationsApi.endpoints.runGitCommand.matchPending, (state, action) => {
      const { repoPath, command } = action.meta.arg.originalArgs;
      state.byRepository[repoPath] = {
        requestId: action.meta.requestId,
        kind: command.kind,
        error: null,
      };
    });

    builder.addMatcher(gitOperationsApi.endpoints.runGitCommand.matchFulfilled, (state, action) => {
      const { repoPath } = action.meta.arg.originalArgs;

      if (state.byRepository[repoPath]?.requestId === action.meta.requestId) {
        delete state.byRepository[repoPath];
      }
    });

    builder.addMatcher(gitOperationsApi.endpoints.runGitCommand.matchRejected, (state, action) => {
      const { repoPath } = action.meta.arg.originalArgs;
      const current = state.byRepository[repoPath];

      if (current?.requestId !== action.meta.requestId) return;

      current.error = failureFromUnknown(action.payload ?? action.error, "runGitCommand");
    });
  },
});

export const { commandFailureDismissed } = slice.actions;
export const gitCommandFeedbackReducer = slice.reducer;

const failureTitles = {
  amend: "Couldn’t amend this commit",
  undo: "Couldn’t undo this commit",
  "stash-save": "Couldn’t save this stash",
  "stash-staged": "Couldn’t stash staged changes",
  "stash-apply": "Couldn’t apply this stash",
  "stash-pop": "Couldn’t pop this stash",
  "stash-drop": "Couldn’t delete this stash",
  "stash-switch": "Couldn’t switch branches with a stash",
  fetch: "Couldn’t fetch remote changes",
  pull: "Couldn’t pull remote changes",
  merge: "Couldn’t merge this branch",
  rebase: "Couldn’t rebase this branch",
  "cherry-pick": "Couldn’t cherry-pick this commit",
  revert: "Couldn’t revert this commit",
  continue: "Couldn’t continue the Git operation",
  abort: "Couldn’t abort the Git operation",
  skip: "Couldn’t skip this commit",
  "restore-file": "Couldn’t restore this file",
  push: "Couldn’t push commits",
  publish: "Couldn’t publish this branch",
  switch: "Couldn’t switch branches",
  track: "Couldn’t track this branch",
  create: "Couldn’t create this branch",
  rename: "Couldn’t rename this branch",
  delete: "Couldn’t delete this branch",
  "tag-create": "Couldn’t create this tag",
  "tag-delete": "Couldn’t delete this tag",
  "worktree-add": "Couldn’t create this worktree",
  "worktree-remove": "Couldn’t remove this worktree",
} satisfies Record<GitCommand["kind"], string>;

export function gitCommandFailureTitle(kind: GitCommand["kind"]) {
  return failureTitles[kind];
}
