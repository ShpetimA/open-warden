# Rename and binary-file handling

## Ownership

- Native Git status keeps the original path for each staged rename. Index and worktree status are classified separately.
- Changes forwards that identity with the selected file. Loading a diff does not scan the repository again.
- Guarded text edits resolve the current rename identity inside the repository write guard, then compare both expected sides.
- Whole-file unstage resets both rename paths. Batch stage/unstage uses one index write and emits one repository change event.
- Discard restores the original name. It refuses to overwrite a new file at that name.

## Content contract

Each side of a file read is one of:

| State                               | Data                | UI                                            |
| ----------------------------------- | ------------------- | --------------------------------------------- |
| Missing                             | `null`              | Not present                                   |
| UTF-8 text without NUL bytes        | Name and contents   | Text viewer or diff                           |
| Binary or unsupported text encoding | Name and byte count | Read-only file information                    |
| Larger than 32 MiB                  | Name and byte count | Preview-limit notice; contents are not loaded |

The renderer parses replies at the IPC boundary. Metadata never becomes fake empty text.

`DiffWorkspace` routes non-text content before mounting Pierre, line comments, or hunk actions. Repository files, conflict files, guidance, and PR conversation snippets use the same information panel. Text-edit APIs reject binary input before writing.

## Verification

- `electron/gitFidelity.test.ts` uses real temporary repositories. It covers staged renames with later worktree edits, unstage, discard, original-path protection, literal batch paths, binary transitions, unsupported encoding, large files, and rejected text writes.
- `tests/electron/git-fidelity.spec.ts` checks Changes, History, branch review, and repository files through native IPC in both themes.
- `tests/e2e/pull-request-commits.spec.ts` checks binary PR files and commit views, including the viewed-file control.

## Remaining limits

- No inline image comparison yet.
- Text classification uses UTF-8 decoding and NUL detection. Git attributes and custom encoding filters do not override it.
- Mode-only changes, symlinks, and submodules still need dedicated representations.
- Unstaged external moves normally appear as a deletion and an untracked file until Git identifies a staged rename.
