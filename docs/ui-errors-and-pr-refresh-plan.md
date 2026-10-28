# UI error recovery and PR actions

Status: error-contract and shared-surface implementation verified. The completed commit-pane, hover, and diff interaction changes are committed separately as `332e3a4`.

## Implemented error foundation

- All desktop command replies use a validated, serializable `DesktopResult<T>`. Provider, Git, filesystem, persistence, and transport failures share a safe failure payload; event streams keep their existing contracts.
- RTK Query retains failure metadata. Initial reads, retained-content notices, and command/form failures use shared ErrorState, ErrorNotice, and ActionError components with explicit recovery and optional copyable diagnostics.
- Retry is wired through History, repository files, Changes, comparisons, PR inbox/overview/files, and repository setup. PR inbox authentication failures offer reconnect. Settings retain failed changes for retry, and workspace-save failures update one notice instead of adding repeated toasts.
- Native confirmations consume the result envelope explicitly, preserving cancellation for destructive Git actions.

Validation: 366 unit tests pass, 22 PR/History browser tests pass, and the real Electron main/preload/renderer IPC test passes. Storybook recovery cases were checked in both themes at 320 px and 1000 px widths, including a successful retry. Type checks, scoped lint, production build, and Storybook build pass.

The following plan also records later work. A unified PR refresh controller, review-button relocation, polling/backoff policy, and reconciliation of ambiguous remote writes remain separate follow-ups. The findings below describe the original audit.

## Remaining recovery gaps after the first pass

- Guidance still has older error paragraphs for loading, connection, and save failures; these need shared surfaces with operation-specific recovery.
- PR Overview suppresses conversation and repository errors when cached data exists, so failed refreshes can remain invisible.
- Inbox preview checks and file statistics still omit their query errors. Description failures now have Retry and no longer appear as an empty description.
- Polling/backoff for permanent failures and reconciliation after ambiguous remote writes remain follow-ups, as described below.

The PR inbox list and preview now share the resizable sidebar layout. Both panes can collapse, their widths are remembered, and the full description uses the existing scroll area.

## Intended experience

Every failure should explain what could not be completed, preserve useful work, and offer the appropriate recovery action. Provider errors should name Bitbucket or GitHub; desktop connection errors should identify Open Warden. Raw `invoke`, JSON, subprocess output, and stack traces belong outside the main message.

PR refresh should be visible from the inbox and every PR view. Submitting a review should be a clear, compact PR action, separate from copying or publishing inline comments.

## Current findings

| Area              | Current behavior                                                                                                                                                 | Change needed                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Electron IPC      | `electron/main.ts` returns handlers directly; `preload.ts` forwards `invoke` rejections.                                                                         | Preserve structured expected failures across the runtime boundary. Distinguish a failed operation from a missing or unavailable bridge. |
| Provider requests | `electron/bitbucket-repo.ts` and `github-repo.ts` mostly throw message strings, losing status and recovery metadata. Some GitHub paths return raw response text. | Classify at the provider adapter while HTTP status, response headers, and operation context are available.                              |
| Query adapters    | `features/hosted-repos/api.ts` and `source-control/api.ts` reduce caught failures to `{ message }`.                                                              | Keep the failure kind and safe recovery metadata through RTK Query.                                                                     |
| Error display     | `errorMessageFrom` extracts arbitrary messages; several panes render plain error paragraphs.                                                                     | Consistent readable copy, recovery buttons, and optional diagnostic details.                                                            |
| Cached data       | Several selectors suppress errors whenever cached data exists.                                                                                                   | Retain the data and display a compact refresh-failed notice with the last successful update time.                                       |
| Background work   | PR conversation queries poll every 10 seconds; workspace saving can toast again after later state changes.                                                       | Define a recovery policy that avoids repeated notifications and uncontrolled failing requests.                                          |
| Refresh           | Overview has a refresh icon, but its invalidation list omits parts of the comparison. Inbox and Files/Commits lack a consistent equivalent.                      | One scoped refresh controller used by visible controls and recovery actions.                                                            |
| Review action     | `PullRequestReviewControl.tsx` forces `h-10`; `ReviewCopyBar.tsx` places it beside copy/publish actions.                                                         | Move it to shared PR chrome, rename it, and match the compact control height.                                                           |

## Scope audit: error surfaces first

Audit of the current routes and their rendered error components: **10 existing routed screens, plus the in-progress Guidance screen**. Files/Commits are two modes of one PR screen. Sidebars, dialogs, and shared viewers are counted separately from routes.

| Area                  | Screens             | Error surfaces and recovery to cover                                                                          |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Changes               | `/changes`          | Working-tree snapshot, staging/discard/commit actions, and selected diff.                                     |
| Repository files      | `/changes/files`    | File tree, file contents, and optional blame panel.                                                           |
| History               | `/history`          | Commit list, changed files, single/combined diff, and restore/action failures.                                |
| Compare refs          | `/review`           | Branch choices, compared files, and selected diff.                                                            |
| PR inbox              | `/pull-requests`    | Provider connection, repository resolution, and PR list.                                                      |
| PR overview           | PR `overview`       | Detail, reviewers, checks, activity, snippets, lifecycle actions, and comments.                               |
| PR Files/Commits      | PR `files`          | Comparison preparation, commits, grouped files, diff, viewed state, and review comments.                      |
| Local PR review       | PR `local-files`    | Local comparison preparation, file list, diff, and review actions.                                            |
| Repository setup      | `/repository-setup` | Opening/selecting repositories and preparing a linked PR.                                                     |
| Settings              | `/settings`         | Loading/saving preferences and opening their file; in-progress Guidance connection settings also appear here. |
| Guidance, in progress | PR `guidance`       | Walkthrough loading, progress/message saves, referenced diffs, and connection failures.                       |

Cross-cutting surfaces also need the pattern:

- Four command composer implementations: repository actions, Git/change actions, PR actions, and PR creation.
- GitHub and Bitbucket connection forms; Git operation/History action dialogs; PR lifecycle and review forms.
- Shared commit, file, diff, snippet, blame, and symbol-peek viewers. Fixing a shared viewer covers multiple routes.
- Workspace restore/save, settings bootstrap/save, desktop updates, external-editor actions, and clipboard failures. Renderer-only failures use the same UI presentation through a local adapter; clipboard operations do not need to move into IPC.

The search found 23 feature/component files rendering explicit `role="alert"` elements and 15 source files issuing `toast.error` calls, including in-progress Guidance. These sets overlap and exclude plain error paragraphs and silent failures; they are implementation pointers, not additional screen counts. Examples of silent gaps include Settings opening its JSON file without recovery and History restore invoking a mutation without presenting its failure locally.

The common desktop dispatcher currently registers **73 methods in the committed app, or 79 with Guidance**. Update commands use additional dedicated channels. The contract must cover the common dispatcher and those command channels; state/diagnostic event streams retain their own event contracts.

Start with three shared presentations: a pane-level **ErrorState**, a compact **ErrorNotice** for retained/stale content, and an **ActionError** beside a failed form or command. Existing alerts, buttons, disclosure, and toast primitives provide the visual building blocks. Screen owners supply the actual retry/reconnect/resolve action, so a component never guesses whether repeating a write is safe.

## 1. One failure contract for desktop operations

We control both ends of IPC. Define one serializable `DesktopResult<T>` envelope: `{ ok: true, value: T }` or `{ ok: false, error: DesktopFailure }`. Use it for expected failures from provider requests, Git commands, filesystem/repository actions, preferences/session persistence, and other desktop commands. The existing result convention in `platform/desktop/gitOperations.ts` is a starting point; Git and Guidance should converge on the shared envelope instead of maintaining separate transport formats.

The stable failure payload carries a code, operation identifier, safe human-readable message, and applicable recovery metadata such as retry time or diagnostic reference. Categories must include local failures such as busy/locked repositories, invalid input, Git conflicts, missing files, and unavailable desktop services alongside network, authentication, permission, and rate-limit failures. Provider-specific fields are optional context, not the foundation of the contract.

Expected operation failures return the envelope rather than rejecting `invoke`. The bridge separately catches and normalizes genuine transport failures such as a missing handler or disconnected desktop service. Parse serialized replies at the receiving boundary with the existing Zod tooling. Keep unexpected defects identifiable in diagnostics while presenting a safe failure to the user.

Keep precise failure types with their owning modules and translate them into the common failure payload at the desktop boundary. Preserve it through RTK Query. The shared UI then renders the same presentation for equivalent failures regardless of whether they originated in Bitbucket, Git, or a file operation.

The UI model needs the failed operation, safe failure category, provider when relevant, recovery action, and optional retry time and diagnostic reference. Classify cancellations before failures; switching files or leaving a screen should not show an error.

| Failure                            | Example message                                                  | Recovery                                                                                            |
| ---------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Network or timeout                 | Couldn’t reach Bitbucket. Your current changes are still here.   | Retry                                                                                               |
| Authentication                     | Your Bitbucket connection needs attention.                       | Reconnect the relevant account                                                                      |
| Permission                         | This account can’t read this repository.                         | Open connection settings with the required permission explained                                     |
| Rate limit                         | Bitbucket is limiting requests. Try again after the shown time.  | Respect provider retry/reset metadata; distinguish rate limiting from other permission responses    |
| Changed PR revision                | New commits are available. Refresh to review the latest changes. | Refresh comparison                                                                                  |
| Repository or resource unavailable | This pull request couldn’t be found or accessed.                 | Refresh or return to the inbox; do not claim deletion from a potentially permission-masked response |
| Desktop transport                  | Open Warden couldn’t reach its desktop service.                  | Retry connection; expose reload recovery only with draft preservation addressed                     |
| Unexpected failure                 | Couldn’t load the pull request.                                  | Retry the read and offer diagnostic details                                                         |

Diagnostics should include safe operation names, failure codes, provider status, and a reference where available. Keep tokens, authorization headers, raw response bodies, and credentials out of messages, copied reports, and logs. Inspect existing reporting before adding any new logging mechanism.

## 2. Establish consistent error surfaces

Build compact shared error presentations from the canonical alert and button primitives:

- **Initial load failed:** show the message and recovery action inside the affected pane. Keep unrelated panes usable.
- **Refresh failed:** keep previously loaded content visible, mark it as stale, and show Retry beside the refresh status.
- **Submission failed:** keep the composer open, preserve its text and drafts, and put the error beside the submit control.
- **Background operation failed:** show one persistent notice per operation/resource failure episode. Repeated polls or save attempts update that notice instead of producing repeated toasts. Success clears it.
- **Dependent requests blocked:** show the originating failure once. A missing provider connection should not produce separate errors for conversation, commits, and files.

Keep recovery buttons mounted while loading, label their progress, prevent duplicate activation, and preserve focus. Technical details remain behind a disclosure with Copy details. Routine background failures should not repeatedly announce alerts to assistive technology.

Use RTK Query state as the source of truth for request failures. Avoid creating a second global error store that can disagree with query recovery.

## 3. Make retry behavior explicit

Retry buttons rerun the failed operation and any failed prerequisite, rather than reloading the application or clearing every cache.

Reads may have a small, bounded retry policy for transient failures. Authentication, permission, validation, and unsupported-operation failures wait for corrective action. Rate-limited reads honor the provider’s retry time. Pause polling for permanent failures and back off transient failures; manual retry and credential changes can resume the appropriate work.

Publishing comments, submitting decisions, merging, and other writes need operation-specific recovery. Do not automatically repeat a write after an ambiguous timeout. Reconcile with provider state first. Preserve existing draft identities and partial-success handling, removing only comments acknowledged as submitted.

## 4. Provide one coherent refresh action

Place Refresh in the inbox header and in a shared PR action area beside the Overview/Files/Guidance navigation. Keep it available when the PR body has failed to load. Share the controller with error recovery and any existing refresh command.

The inbox refresh reloads the current repository/provider results while retaining filters and pagination where valid. It does not refresh unrelated repositories.

For an open PR:

1. Reload provider detail and establish the latest head revision.
2. Prepare the comparison refs for that revision before requesting its local commit/file/diff data.
3. Refresh the relevant conversation, reviewers, activity, checks, viewed state, and provider extras. Independent sections can complete independently.
4. Refresh the active commits, grouped files, and diff against the established comparison. Mark incomplete or failed sections explicitly.

Track the whole refresh, not just whether the conversation request is fetching. Repeated clicks join the in-flight operation. Target tags/query keys by repository and PR; refreshing one PR should not refetch every open workspace.

Preserve the active tab, grouping, filters, pane widths, expanded folders, selected commit/file when still valid, and comment drafts. Loading must not temporarily empty the file array and reset selection. If a force push removes the selected commit, choose a valid selection and explain the change. Do not present an old diff as belonging to a newly fetched revision.

Show a small refresh progress indicator and the last successful refresh time. Partial failure keeps useful content and offers a targeted retry.

## 5. Clarify and relocate review submission

- Rename **Review** to **Submit review…** so the action describes the next step.
- Put it in the shared PR action area next to Refresh, available from Overview and Files/Commits.
- Match compact PR controls, approximately 28 px tall, using the canonical button presets rather than the current 40 px override.
- Keep **Publish comments** and copy actions with comment tools. Make pending comment counts explicit there.
- Continue opening the existing review composer with Approve, Request changes, and Comment choices. It already explains which pending inline comments will be published; preserve that behavior.
- Explain why submission is unavailable for a draft, closed PR, unsupported provider, or missing data. A connection failure should expose recovery rather than leaving an unexplained disabled action.

## Implementation order

1. **Error surfaces and common contract:** define the desktop result/failure schema and build ErrorState, ErrorNotice, and ActionError with initial-load, stale, retrying, and submission-failed stories. Establish the shared API for reads and commands, including transport failure handling.
2. **Prove provider and Git recovery together:** connect a PR inbox read, a History/Git read, and a Git command failure through the contract and shared presentations. Verify a real Electron IPC round trip, successful retry, and preservation of user input. This establishes the pattern beyond provider APIs immediately.
3. **Apply the error surfaces across the audited scope:** cover the remaining routes, shared dialogs/viewers, and background failures. Include mutation reconciliation, partial publishing, polling policy, and repeated workspace-save notices.
4. **PR refresh and action placement:** shared refresh controller/header actions, comparison sequencing, compact Submit review placement, and state-preserving refresh in Overview/Files/Commits.

Each step should deliver usable recovery through the real path. No error-library replacement, parallel state system, or backwards-compatibility layer is needed.

## Acceptance checks

- A failed read can recover in place without restarting Open Warden.
- Messages do not expose `invoke` wrappers, JSON bodies, or stack traces in normal UI.
- Fake provider responses exercise timeout, authentication, permission, rate-limit, missing-resource, and success-after-retry outcomes through production adapters.
- A real Electron main/preload/renderer test proves structured failures survive IPC; browser bridge fixtures alone do not prove that boundary.
- A failed refresh retains visible content, selection, drafts, and the last successful update time. Recovery clears the notice.
- One polling failure does not create repeated toasts or duplicate pane errors.
- Refreshing after new commits updates metadata, comparison refs, commits, files, and the diff consistently, including a force-pushed-away selection.
- Review/comment recovery preserves text and acknowledged draft IDs and does not duplicate a successful remote submission.
- Refresh and Submit review are visible, compact, and understandable in both themes, narrow/wide windows, and keyboard flows. Storybook covers initial, stale, retrying, recovered, and submission-failed states.
