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

## Follow-up from verification

A native test hit an index lock when it created a stash after app launch. Check optional locks
in status reads in a separate Git coordination pass. Discovery fixtures now seed repository data
before launch; these checks do not establish that external Git writes cannot contend with app reads.
