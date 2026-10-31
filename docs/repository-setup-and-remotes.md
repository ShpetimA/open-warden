# Repository setup and remote management

Open Warden can clone a repository, initialize Git in a new or existing folder,
and manage the active repository's remotes and branch upstream.

## Entry points

- Welcome screen: **Clone repository…** and **Initialize repository…**.
- Command composer: **Clone repository**, **Initialize repository**, and
  **Remotes & upstream**. Opening a repository also offers clone/init actions.
- Repository toolbar: **Remotes & upstream**, beside Fetch/Pull/Push.

Setup opens the resulting repository. If Git succeeds but opening fails, the form
keeps the prepared path and retries opening without cloning or initializing again.

Remote settings support add, rename, fetch URL, optional push URL, and confirmed
removal. Upstream selection searches fetched remote branches. **Stop tracking**
clears the association without pushing or deleting a branch. **Fetch branches…**
opens the existing fetch command; publishing a new branch remains a separate action.

## Ownership and protection

The desktop boundary parses setup and configuration commands with shared schemas.
Git runs through argument arrays. Clone requires a new destination under an
existing parent. Init preserves existing files and refuses a folder already inside
a repository. Setup serializes simultaneous requests for the same destination.
Failure cleanup removes only an empty directory created by that request, after
checking its filesystem identity. Partial content is retained.

Configuration edits use the shared repository write coordinator and emit config/ref
events. Existing freshness ownership updates repository and provider queries.
A revision of the local configuration and checked-out branch guards stale forms.
Multiple fetch/push URLs remain visible, but URL editing is disabled for those
advanced configurations so a single-field edit cannot silently replace them.

HTTPS clone/fetch/pull/push use saved GitHub or Bitbucket credentials for those
public hosts. Authentication headers live in the Git process environment, never
the saved remote URL or command arguments. SSH uses the user's Git/SSH setup.
Existing URL credentials are removed from the configuration returned to the UI.

## Verification and remaining limits

Real temporary repositories exercise init, clone, existing-file protection,
invalid input, concurrent setup, remote changes, stale revisions, upstream changes,
custom push URLs and credential redaction. Existing fetch/pull/push tests also pass.
The native Electron check crosses preload/IPC to the actual Git implementation.

Browser checks cover retained input after failures, retries, upstream search,
setting/clearing/replacing upstream, popup pointer selection, keyboard dismissal,
and light/dark layouts at 1440px and 1100px. Storybook includes configured, empty,
and failed-save states.

Live authenticated GitHub/Bitbucket operations have not been verified in this pass.
Clone has a five-minute timeout and no cancellation/progress protocol yet. A failed
clone retaining partial files requires a new destination or deliberate cleanup
outside this form. Remote settings currently read repository-local configuration;
advanced inherited configuration remains a Git configuration workflow.
