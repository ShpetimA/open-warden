# ADR 0001 — Global workspaces and rail navigation

## Status

Accepted and implemented.

## Decision

The titlebar contains repositories and individual pull requests. Sections live
in one contextual rail: Changes, Repository files, Pull Requests, History and
Compare refs for repositories; Overview, Files and Checks for pull requests.
Settings is a transient global screen with the workspace tabs still available.

A PR's identity is provider + owner + repository + number, independent of its
local checkout. Opening its branch or worktree updates the same PR workspace;
it does not create another repository tab. PR list entries and the current
branch shortcut open or focus that workspace.

The workspace reducer owns ordered tabs, active identity, section locations,
recently closed tabs and layout memory. The root workspace transition restores
source-control selections and review state atomically while keeping activeRepo
as the projection required by repository services. Global preferences and query
caches remain shared. Closing a background tab preserves the active view;
closing the active tab selects its right neighbor, then its left. Closing a
repository tab does not remove independent PR tabs or comments.

Repository section URLs remain concise. PR URLs carry provider/repository/PR
identity; the navigation boundary restores the last location when a workspace
changes and returns to the repository workspace when leaving a PR for the inbox.
The old branch-PR routes and duplicate feature rail are removed.

Session storage parses tab metadata at the boundary and saves all tab types,
order, active identity, locations, selected files/commits, commit drafts, pane
layouts and supported viewport offsets. Full live review state is isolated
between open tabs; query data is refreshed on re-entry. Session writes are
serialized, with a short debounce for interactive state updates.

The tab strip keeps add and overflow controls reachable. Arrow/Home/End keys
navigate tabs; Mod+1..9 selects a workspace, Control+Tab cycles, Mod+W closes,
and Mod+Shift+T reopens. Focus returns to the surviving tab or add control.
Blank titlebar space remains draggable in Electron.

Storybook shares WorkspaceChrome, WorkspaceTabs, rail section definitions and
the workspace reducer with the application, including a 680px composition.

## Verification

Reducer and router tests cover independent selections/drafts, PR repository
projection, adjacent close, route restoration and session round trips. Component
tests cover arrow navigation, reachable add and focus recovery. Electron was
exercised with multiple repositories and an authenticated PR: History/Files
switching, Settings return, numbered shortcuts, close/reopen and renderer reload.
Light and dark Storybook compositions were inspected at wide and 680px widths.
Branch checkout and worktree creation were not run against the user's repositories.
