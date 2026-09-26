# Git client and pull request roadmap

Open Warden's pull request list stays scoped to the active project. A cross-project inbox is a separate product decision and is outside this plan.

Progress: slices 1–6 are implemented. Slice 6 awaits the requested manual app test.

## 1. Checks and merge readiness

- Read GitHub check runs and commit statuses, and Bitbucket commit statuses, for the PR head commit.
- Show passing, failing, pending, and absent checks in both the PR preview and full review screens. Link each check to its provider page when available.
- Show provider mergeability separately from check results. Keep the provider as the final authority when merging; a green check summary alone is not a promise that merge will succeed.
- Refresh after head changes and after merge attempts. Handle missing permissions and partial provider responses explicitly.

## 2. Project-scoped PR discovery

- Search the current project's PRs on the provider, with open, merged, and closed states; author and involvement filters; and a clear loading/empty/error state.
- Keep opening a PR as a preview tab distinct from opening its branch or worktree.
- Add draft, review, check, and label filters only when the provider returns enough data to make them accurate.

## 3. Review workflow

- Show requested reviewers and approvals, then support add/remove reviewer where the provider allows it.
- Submit one review containing the overall decision, message, and pending inline comments. Preserve drafts if submission fails.
- Show provider permissions and capabilities in the UI rather than offering actions that cannot succeed.

## 4. PR lifecycle

- Edit title and description; close/reopen and merge with a clear confirmation for consequential actions.
- Add GitHub draft/ready, update branch, auto-merge, and revert only where supported. Bitbucket keeps its own available action set.
- Surface branch protection or merge conflicts as actionable reasons; recheck the head SHA before mutations.

## 5. Review continuity

- Persist viewed-file state where the provider supports it; provide a local fallback only when clearly labeled.
- Add commit and activity timelines, including review decisions and force pushes, without duplicating the current conversation view.

Current limits: GitHub viewed marks live on GitHub; Bitbucket marks are stored on this device for each PR head commit. Activity shows the first provider page of events and commits and labels truncated results. GitHub reports force pushes explicitly; Bitbucket activity reports source updates without assuming they were force pushes.

## 6. Provider extras and core Git

- Add GitHub labels, reactions, workflows, and stack relationships when useful for a project review. Keep Bitbucket-specific limits visible.
- Audit and fill Git client gaps in blame, tags, and worktree lifecycle with the same keyboard and confirmation rules as the command composer.

GitHub project review now supports label editing, comment reactions, workflow rerun and cancellation, and parent/child PR links. A parent link is stored as `Depends on #<number>` in the PR description; branch relationships are also shown when both PRs are in the first page of open project PRs. Missing provider permissions and truncated results are shown rather than treated as empty data. Bitbucket identifies these GitHub-only extras as unavailable.

The file viewer and command composer expose blame. The composer lists, creates, and deletes local tags and creates or removes linked worktrees. Removal refuses the active worktree and any checkout with tracked, untracked, or ignored local files. Reopening PR branches and worktrees fast-forwards without resetting local commits or deleting files. The app interaction pass is deferred at the user's request.

## Delivery rules

- Each slice ships with provider behavior, UI, and a focused verification pass before moving on.
- Navigation and opening tabs do not need confirmation. Mutations that are hard to undo do.
- The command composer remains the keyboard entry point; project-scoped PR screens remain available for deeper review.
