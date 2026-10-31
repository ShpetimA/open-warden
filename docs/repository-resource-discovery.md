# Repository resource discovery

Repository headers show Stashes, Tags, and Worktrees with live counts. The menus launch
existing command flows, so creation and deletion retain their preview and confirmation steps.
Worktrees can also be opened directly as project tabs. The current checkout cannot be removed
from its own menu.

Repository files offer Show line authors (blame) in the file context menu. It opens the existing
file viewer with attribution enabled; text drafts and non-text file safeguards still apply.

Counts come from the shared repository-state query and event owner. No pane watcher or extra
polling loop was added. Loading and failed reads have explicit menu states and refresh recovery.
Native verification creates a stash, tag, and linked worktree in a temporary repository, previews
without applying the stash, opens its tag in History, switches checkout, and inspects line authors.

## Status-read coordination

Production verification reproduced index-lock conflicts between background status reads and
external staging. Both Git adapters now use `--no-optional-locks`. Status reads still compute
current changes, while skipping their optional index-cache write. Required write locks remain in force.
Conflict lookup uses `git diff-files`, which compares the index without the porcelain diff command's cache refresh.
This follows [Git's background status guidance](https://git-scm.com/docs/git-status#_background_refresh).

Regression checks touch file metadata and verify both read APIs leave the index bytes unchanged.
A plain Git status call then changes those bytes, proving the fixture exercises the cache refresh.
Another check verifies an existing index lock still blocks an amendment and remains untouched.
