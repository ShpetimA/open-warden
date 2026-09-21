# ADR 0001 — Global workspaces and rail navigation

## Status

Accepted — migration in progress. Phase 1 (workspace model) and Phase 2 (global tab bar) in flight.

## Context

Navigation used to mix concerns: a bottom repository bar, a centered feature
tab row (`Changes / Pull Requests / History / Review`) in the header, and a
feature-local rail inside the changes routes. Opening a pull request was tied
to whichever repo happened to be active, so it was possible to "tab into"
pull requests while looking at local changes — tabs and context never lined
up. Explorations of alternative layouts (slim icon rail, per-project top bar,
combined variants) confirmed the direction:

- The top tab row should be **global** and only ever contains workspaces
  (open repositories and open pull requests), never screens.
- Internal navigation (which screen inside a workspace) should live on a
  **rail**, with sidebar panels staying contextual per screen.

## Decision

1. **One workspace model.** A new `workspaces` Redux slice owns the set of
   open workspaces:
   - `Workspace = RepoWorkspace | PullRequestWorkspace`
   - `RepoWorkspace   → { id = repoPath, kind: "repo", repoPath }`
   - `PRWorkspace     → { id = "pr:<repoPath>:<number>", kind: "pull-request", repoPath, providerId, owner, repo, pullRequestNumber, title }`

   `sourceControl.activeRepo` remains the repo-scoped projection; the
   `workspaces` slice mirrors it through the existing open/close/app-pick
   actions so repo-scoped consumers (comments, diffs, git API tags) are
   untouched.

2. **Global tabs in the titlebar.** A workspace tab bar (`WorkspaceTabs`)
   lives in the header titlebar next to the traffic lights: one row of
   workspaces only. The bottom repository bar is deleted. The `+` control
   opens the recent-projects picker; closing a tab closes that workspace.

3. **Rail for internal navigation (Phase 3).** A `WorkspaceRail` replaces the
   centered feature nav and the feature-local rails: it renders the section
   set of the active workspace — project rail (Changes / Files / Pull
   Requests / History / Review) or PR rail (Overview / Files / Checks).

4. **Routes become workspace-scoped (Phase 4).** `workspace/:workspaceId/<section>`
   with per-kind sections; feature nav helpers move into the rail.

5. **Hotkeys (Phase 4).** `⌘1..9` switch workspaces; `⌘⇧S`-style sidebar
   toggles stay; sidebar-toggle buttons remain contextual.

## Migration phases

| Phase | Scope                                          | Notes                                                          |
| ----- | ---------------------------------------------- | -------------------------------------------------------------- |
| 1     | `workspaces` slice + sync with repo session    | mirrored by `openRepo`, `closeRepo`, `restoreWorkspaceSession` |
| 2     | Titlebar workspace tab bar; bottom bar removed | repo workspaces; PR entries arrive with PR workspaces          |
| 3     | `WorkspaceRail` per workspace kind             | retire `FEATURE_NAV_ITEMS` header nav + `ChangesRail`          |
| 4     | Routes + hotkeys                               | `workspace/:id/…`, `⌘1..9`                                     |
| 5     | Cleanup + Storybook truth                      | delete legacy tabs, reshape Interactive Shell story            |

## Risks

- Repo-scoped state (comments, review sessions, history selection) must keep
  riding on `activeRepo`; PR workspaces own a repo, so semantics survive.
- Close-the-last-repo flows must reproduce the "fall back to picker" behavior
  currently encoded in `closeRepo`.
