# Repository freshness through native change hints

Status: accepted, 30 October 2026.

Repository reads used separate mutation invalidations and focus/polling rules. The native
write coordinator already owns app mutations but did not notify other mounted views.

`RepositoryEvents` owns native subscriptions for open workspace repositories. It merges
completion hints from the write coordinator, including failed operations which may have
partially changed state, with worktree and Git metadata watcher hints. Write effects are required
and declared in `electron/repositoryChangeDefinitions.ts`; diagnostic operation strings never
select refresh policy. Filesystem hints use explicit metadata scopes and owned filename rules. It never infers
Git state from filesystem events. Renderer queries reread authoritative data.

One renderer bootstrap synchronizes the open-repository set, listens before requesting
subscriptions, and invalidates the affected repository/query families. Inactive views
have their caches invalidated without being mounted. Focus and reconnect recover missed
notifications. Browser-only adapters retain mutation invalidation because they have no
native event stream.

`RepositoryWatchPool` owns recursive native subscriptions through `@parcel/watcher`, with
shared leases for identical roots/ignore policies and shared nonrecursive parent handles for
root replacement. On macOS the package uses FSEvents rather than one Node watcher per directory.
A reported `EMFILE` failure prompted replacing the earlier directory-per-watch implementation,
whose Node handle count grew with repository directories. There is no repository-count cap or polling fallback for healthy roots.

The existing Git file-list reader supplies ignored paths so recursive subscriptions exclude
ignored dependencies/build output. Tracked files inside ignored directories remain observable.
Symlink directories are not followed. Worktree Git directories and common directories are distinct:
index changes are local, while shared refs reach every subscribed linked worktree. Bursts have a
debounce and maximum latency. Root/metadata inode replacement reattaches subscriptions. Failed
attachment reports recovery and retries at a bounded interval. Disposal releases timers, listeners
and native leases; asynchronous watcher errors have owned handlers, including settings watching.

The native package stays external to the main-process Vite bundle. Electron packaging must include
its platform binary outside the ASAR archive. macOS is exercised locally; Linux and Windows native
backends still need their own runs. Network filesystems can lose notifications; focus/manual
refresh remains an authoritative recovery mechanism.

T3 Code's `VcsStatusBroadcaster` informed the ownership/lifetime and local-versus-remote
refresh distinction. Open Warden keeps its existing Electron/Redux architecture rather
than importing T3 Code's Effect runtime or remote transport.
