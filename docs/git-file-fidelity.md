# Git file types and rename handling

## Ownership

- Native Git status keeps the original path for each staged rename. Index and worktree status are classified separately.
- Changes forwards that identity with the selected file. Loading a diff does not scan the repository again.
- Guarded text edits resolve the current rename identity inside the repository write guard, then compare both expected sides.
- Whole-file unstage resets both rename paths. Batch stage/unstage uses one index write and emits one repository change event.
- Discard restores the original name. It refuses to overwrite a new file at that name.
- Stored reads inspect tree/index entries before loading blobs. Submodule commit IDs do not require objects in the parent repository.
- Worktree reads inspect links themselves. Broken links remain visible, and reads through symlink parents are rejected.

## Content contract

Each side of a file read is one of:

| State                               | Data                | UI                                            |
| ----------------------------------- | ------------------- | --------------------------------------------- |
| Missing                             | `null`              | Not present                                   |
| UTF-8 text without NUL bytes        | Name and contents   | Text viewer or diff                           |
| Binary or unsupported text encoding | Name and byte count | Read-only file information                    |
| Larger than 32 MiB                  | Name and byte count | Preview-limit notice; contents are not loaded |
| Symbolic link                       | Name and target     | Read-only before/after targets                |
| Submodule                           | Name and commit ID  | Read-only commit pointers and checkout state  |

The renderer parses replies at the IPC boundary. Metadata never becomes fake empty text.

Comparisons include `modeChange` only when both entries exist and their Git modes differ. A permission-only change shows its old/new mode and executable-bit meaning. A text change keeps its normal diff and adds the mode notice. Worktree comparisons respect `core.filemode`.

Submodule worktree reads distinguish an uninitialized checkout from a checked-out commit. Tracked edits and untracked files are reported separately. Historical and staged pointers carry no worktree state.

`DiffWorkspace` routes non-text and permission-only content before mounting Pierre, line comments, or hunk actions. Repository files, conflict files, guidance, and PR conversation snippets use the same information panel. These states do not start language diagnostics. Text-edit APIs require regular text files.

## Verification

- `electron/gitFidelity.test.ts` uses real temporary repositories. It covers renames, protected mutations, binary transitions, large files, permissions, type changes, broken/external links, unavailable gitlink objects, and real dirty/deinitialized submodules.
- `tests/electron/git-fidelity.spec.ts` checks Changes, History, branch review, and repository files through native IPC in both themes.
- `tests/e2e/pull-request-commits.spec.ts` checks binary, link, and submodule PR views, including the viewed-file control.

## Remaining limits

- No inline image comparison yet.
- Text classification uses UTF-8 decoding and NUL detection. Git attributes and custom encoding filters do not override it.
- Submodule initialization, update, and conflict resolution need dedicated workflows. This slice displays their file state.
- Unstaged external moves normally appear as a deletion and an untracked file until Git identifies a staged rename.
