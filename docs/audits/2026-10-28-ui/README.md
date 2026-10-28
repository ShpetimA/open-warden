# Open Warden UI audit — 28 October 2026

The compact commit rows, file trees, and two-sidebar navigation are the strongest part of the app now. The remaining inconsistency is mostly around them: status feedback, action placement, editors, empty states, and settings still follow different layout rules.

This is an audit of the current working tree, including the recent uncommitted UI polish. No product code was changed for this audit.

## Priorities

| Priority | Finding                                                                    | Recommended next action                                       |
| -------- | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| P1       | Review/check status falls below the entire conversation at narrower widths | Keep a compact status summary above the timeline              |
| P1       | Loading sometimes appears as a negative fact                               | Distinguish unknown, loading, empty, and unavailable          |
| P1       | Markdown formatting buttons have no accessible names                       | Give each control an explicit label                           |
| P2       | Finishing a review opens the generic command wizard                        | Prototype a focused review composer and predictable dismissal |
| P2       | Comment editor still uses a much larger visual vocabulary                  | Bring its tabs, spacing, and controls into the compact system |
| P2       | Clean Changes view devotes substantial space to disabled commit UI         | Design a deliberate clean state and smaller composer          |
| P2       | Repository files lack the filtering/header pattern used elsewhere          | Share the compact file-pane structure                         |
| P2       | Compare refs uses a different file-pane vocabulary                         | Align headers, filtering, and terminology                     |
| P2       | Routine diagnostics consume a separate full-width row                      | Move non-actionable status into quiet chrome                  |
| P2       | Settings leads with configuration details and oversized sections           | Reorder around preferences; disclose advanced configuration   |
| P2       | Shortcut help and command stories describe different behavior              | Bring references into line with the actual app                |
| P2       | Empty states do not explain why content is absent                          | Use state-specific messages and relevant next actions         |
| P3       | Diff controls need clearer functional grouping                             | Group review state, layout, and utility actions               |
| P3       | Guidance repeats the step title on every code note                         | Separate step context from each note’s local explanation      |

P1 means a correctness, accessibility, or information-access issue. P2 means a recurring workflow or consistency issue. P3 means a refinement worth prototyping. These are product priorities, not security classifications.

## Findings

### 1. Important overview status moves too far down

**Confirmed in the rendered overview composition and source.** Below the `xl` breakpoint, the right-hand review/check/merge panel follows the complete conversation in DOM order. In the open PR fixture at a measured CSS viewport of 1000 × 740, Reviews starts at y=1528, Checks at y=1694, and the merge button at y=1819. There is no horizontal overflow; the problem is information order. A long real conversation pushes these controls much further away.

Keep a compact review/check summary before the timeline when the second column cannot fit. Expand its details on demand. The conversation should not determine how far someone must scroll to understand the PR’s current state.

Source: `apps/desktop/src/features/pull-requests/overview/PullRequestOverviewLayout.tsx:17`.

[Narrow light overview](assets/overview-narrow-light.png) · [Wide dark overview](assets/overview-wide-dark.png). These screenshots use Storybook fixture data.

### 2. Loading is sometimes presented as an actual negative result

**Observed in the native app; source confirms the missing distinctions.** PR #2985 initially showed “No reviewers / Nobody has been asked to review,” then changed to “1/3 approved / Waiting on 2 reviewers.” The command composer initially showed “3 of 17 ready” and “No remote configured,” then enabled more actions and showed “9 of 17 ready” after its repository data arrived.

The overview maps absent reviewer data to an empty array. The command composer derives availability and explanations from repository data before distinguishing whether that data is known.

Show “Loading review status…” or a quiet skeleton until the answer is known. Retain known data during refresh. Only show “No reviewers” or “No remote configured” after a successful empty result; failed requests need their own state.

Sources: `overview/usePullRequestOverviewView.ts:69,96`, `overview/status.tsx:54`, and `command-palette/ChangeCommandComposer.tsx:227,250`, under `apps/desktop/src/features/`.

### 3. Markdown toolbar buttons are unnamed

**Confirmed in the native accessibility tree and source.** The general PR comment composer exposes nine unnamed formatting buttons. `MdToolbarButton` places the label inside a tooltip, while the button has no explicit accessible name and its SVG is hidden from accessibility APIs. The textarea also depends on its placeholder rather than a persistent visible field label.

Give each button an explicit accessible name, including its purpose rather than its icon shape. Give the editor a stable label and verify keyboard focus visibility. Hover text should supplement the control’s name.

Source: `apps/desktop/src/components/markdown/MarkdownEditor.tsx:379,504–545`.

### 4. The review action still feels like command execution

**Native interaction confirmed; design recommendation.** The smaller “Review…” control is an improvement in density. Its location beside Overview, Files, and Guidance makes it read partly as navigation, though it opens a consequential action. Inside, the flow says “Action: Submit review,” repeats the current PR, and ends with “Confirm submit review.” Escape goes back to choosing a PR rather than closing this context-specific review. There is no visible close button.

This explains why changing the button’s size has not fully solved the feeling. Prototype a focused “Finish review…” composer that opens directly on Comment / Approve / Request changes, includes the draft count, and dismisses back to the current PR. Keep one stable entry point. Keep the generic command wizard for commands, with the focused composer available from it too.

Sources: `features/pull-requests/components/PullRequestReviewControl.tsx`, `features/workspaces/components/ProjectReviewTabs.tsx`, and `features/command-palette/AppCommandPalette.tsx:64–75`.

### 5. The comment editor is still visually oversized

**Source confirmed and observed in the native overview.** The editor uses pill tabs, round formatting controls, 20px textarea padding, 15px monospace text with a 28px line height, and additional surrounding borders. These compound even for a one-line comment. The compact rendered notes are now much calmer than the interface used to write them.

Use the canonical compact tabs and buttons. Start with a small readable prose field, expand naturally for longer writing, and keep formatting secondary. Preserve a clear focus treatment and comfortable pointer targets; compactness should come from removing duplicated chrome and padding.

Source: `apps/desktop/src/components/markdown/MarkdownEditor.tsx:285–386`.

### 6. Changes needs a deliberate clean state

**Observed in the real clean working tree.** The sidebar begins with a sizeable commit textarea, Amend, Undo commit, and a disabled full-width Commit button. Below it says “No files,” while the main pane asks for a file selection. The dominant area is an action that cannot currently be completed.

Use a clear “Working tree clean” state with the useful repository/last-commit context. Reduce the resting composer to a summary field with optional description expansion. Put less common commit operations into a secondary action area. Keep the normal active-change flow fast.

Source: `apps/desktop/src/features/source-control/components/CommitBox.tsx:64–117`.

[Native Changes screenshot](assets/changes-native.jpg).

### 7. Repository files do not have the same findability as PR files

**Native and source confirmed.** PR file panes have a filter, count, and grouping control. Repository files renders the tree directly without a comparable local filter or pane header. In the loaded monorepo, the expanded directory structure is long enough that browsing becomes the primary way to find something.

Reuse the compact file-pane header: Files, filter, count, and relevant tree controls. Keep expansion stable across selection. A collapse-all action and a discoverable quick-open path would help large repositories. Ordinary-file hover cards are unnecessary here; retain the intentionally restrained hover behavior.

Source: `apps/desktop/src/features/source-control/components/RepoFilesTab.tsx:47–96`.

### 8. Compare refs looks like a different generation of the app

**Native and source confirmed.** The rail calls this Compare refs, while the pane uses “BRANCH REVIEW,” Base, and Compare. Its grouping/header structure differs from PR files, and it lacks the same filter/count arrangement. The underlying task is still selecting a set of changed files and reading a diff.

Align the file pane with the PR review pattern. Use one consistent pair of ref names, such as Base and Compare, and make the comparison controls a compact context row above the shared file browser. Keep the two selectors clear when names are long.

Sources: `apps/desktop/src/features/source-control/screens/ReviewScreen.tsx:297,351` and `components/ReviewFileList.tsx` in the same feature.

### 9. Routine diagnostics consume too much diff space

**Observed in History and confirmed in source.** “No diagnostics reported” occupies a separate bordered row above the diff. The zero-result, checking, and unavailable states all reserve a row, so the vertical stack changes between diff contexts even when nothing needs attention.

Use a quiet toolbar/status indicator for zero diagnostics and routine checking. Reserve a full notice for an actionable issue; retain a way to inspect details when diagnostics are unavailable.

Source: `apps/desktop/src/features/lsp/components/LspStatusNotice.tsx:67–99`.

### 10. Settings has a different hierarchy and spacing rhythm

**Rendered in the browser fallback; native structure and source checked.** Settings starts with an icon tile, large heading, JSON storage explanation, then Agent connection before Appearance. Large rounded sections, repeated configuration explanations, and a prominent JSON action draw attention away from ordinary preferences. The file-tree preference also switches to title case (“File Tree Views”).

Put Appearance and everyday preferences first. Group Agent connection and JSON details under clearly named advanced/configuration sections. Use the established corner radii and section spacing, with short labels and optional supporting detail. Settings can be more spacious than a file tree without becoming a separate visual system.

Source: `apps/desktop/src/features/settings/screens/SettingsScreen.tsx:52–145`.

[Settings screenshot](assets/settings-light.png). This is the browser fallback, whose connection state differs from the native app; it is evidence of layout, not the native server’s status.

### 11. Keyboard help and command documentation have drifted

**Native behavior, source, and Storybook compared.** Settings says ⌘K searches files and commands; the header says “Compose a Git command,” and the current implementation is a command flow. The command-launcher composition still depicts a universal resource search. J/K is documented only as next/previous file, and H/L only as commits/files, omitting Guidance’s step/file context.

Update the reference around actual contexts: global navigation, active list navigation, and review/guidance navigation. Use the same action names in tooltips, help, and stories. Clearly mark aspirational compositions so they are not mistaken for implemented behavior.

Sources: `apps/desktop/src/features/settings/components/KeyboardShortcuts.tsx:1–24`, `features/command-palette/AppCommandPalette.tsx`, and the `Workspace navigation / Command launcher` composition.

### 12. Empty messages do not distinguish different situations

**Native, browser fallback, and source confirmed.** The app alternates among “No files,” “Select a file to view diff,” “Select a file from the tree,” and “No diff content.” These messages mix a clean working tree, no active selection, and a diff with no renderable content. The welcome screen also repeats “Open project” in its heading and action, while showing an active-looking “View all (0)” for no recent projects.

Define a small set of meaningful empty states: clean working tree, choose a file, no filter matches, no textual diff, and no recent projects. Use one short explanation with a relevant next action where useful. Avoid adding large decorative empty-state panels to the workspaces.

Sources: `features/source-control/components/ChangesUnifiedPierreFileTree.tsx:62`, `features/source-control/screens/HistoryScreen.tsx:171`, `features/diff-view/components/DiffViewer.tsx:366`, and `features/source-control/components/EmptyRepoState.tsx`.

### 13. Diff controls need stronger grouping, not more buttons

**Design judgment from the native diff controls.** Viewed state, split/unified layouts, unchanged-section expansion, editor choice, and comment utilities are all small glyph actions in a tight area. Several use similar rectangular shapes. Individual tooltips help discovery, but the functional groups are harder to read at a glance.

Use stable groups: review state, display mode, then external/copy utilities. Keep the active display mode unmistakable, with consistent hover and focus treatment. Avoid text labels on every icon or adding another tall toolbar. The recently differentiated left-rail icons should stay.

Relevant surfaces: the shared diff header and `features/source-control/components/OpenInExternalEditor.tsx`.

### 14. Guidance repeats section context on every note

**Rendered in the multi-file guidance story and confirmed in production mapping.** Every range annotation uses the step title. A file with several ranges therefore repeats the same long heading above separate notes. If a range has no local note, the full step body is reused too. This can bring back the verbosity the compact guidance design is trying to avoid.

Keep the step’s purpose available once, then let local notes explain only the nearby code. Consider a compact “Explanation · L18–22” label or a short optional note title. For generation, require each note to add distinct information and avoid copying the section summary into every range. Multiple notes per file are useful when each has its own reason to exist.

Source: `apps/desktop/src/features/guidance/GuidanceScreen.tsx:260–273`.

[Guidance note repetition](assets/guidance-dark.png). The story uses a simplified code presentation, so it does not prove the layout of production Pierre split annotations.

## What to preserve

- Shared compact commit rows, including History’s multiselect.
- Two independently collapsible sidebars with H/L focus and J/K list movement.
- Filenames under commit-title groups, with commit-specific diffs.
- Collapsible explanations close to their code and readable rendered Markdown.
- Delayed folder/commit hover details; ordinary file rows remain quiet.
- The clearer left-rail icons and the removal of an empty comment-action bar.
- The shared diff workspace and its display preferences across PR Files and Guidance.

## Suggested implementation order

1. Fix loading truth and editor accessibility. These are bounded correctness changes.
2. Fix overview information order at narrower widths.
3. Prototype the focused review completion flow before moving the button again.
4. Unify file-pane headers, clean/empty states, and routine diagnostics chrome.
5. Compact the editor and settings, then refine diff grouping and guidance note hierarchy.

## Coverage and limits

| Surface                       | What was inspected                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------- |
| Changes                       | Native clean tree, commit controls, empty selection, source                                       |
| Repository files              | Native large monorepo tree and source                                                             |
| History                       | Native commit/file/diff structure, filtering, multiselect presentation, diagnostics               |
| Compare refs                  | Native selectors/file pane/diff controls and source                                               |
| PR inbox/workspaces           | Native navigation and preview structure; resizable composition                                    |
| PR overview                   | Native PR #2985; light/narrow and dark/wide overview fixtures                                     |
| PR Files / Commits            | Native compact commit/file panes and shared diff actions                                          |
| Guidance                      | Native six-step walkthrough, step/file panes and code explanations; long-note/multi-file fixtures |
| Review action                 | Opened current-PR composer; checked Escape/back; closed without submitting                        |
| Project opening               | Opened repository chooser; inspected labels; closed without choosing/cloning                      |
| Settings / welcome            | Native structure, browser fallback rendering, shortcut source                                     |
| Components / secondary states | Sampled review notes, command launcher, error recovery, and resizable-pane stories                |

The overview was measured at CSS viewports of 1000 × 740 and 1440 × 900; other samples included 1280 × 800. Both light and dark Storybook rendering were inspected. This is representative theme/resize coverage, not every screen in every combination. Saved preview images can use capture dimensions different from the measured CSS viewport.

Native screenshot capture became unreliable after the first capture, while the accessibility tree continued to work. Native interaction findings therefore use observed accessibility state plus source; screenshot evidence is explicitly identified as native, browser fallback, or Storybook. Development reload artifacts were excluded.

No comments, reviews, merges, commits, branch changes, settings changes, or agent requests were submitted. Conflict, provider-authentication, binary/very-large-diff, and network-failure flows were not induced end to end. Error recovery is being refactored concurrently; its new composition was sampled, and this report avoids treating in-flight old error presentation as a settled defect. Source line references may move with that work.

Only this report and its five screenshot assets were added. Existing application changes were left untouched.
