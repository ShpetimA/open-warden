import { watch } from "node:fs";
import path from "node:path";
import { subscribe, type AsyncSubscription } from "@parcel/watcher";
import { z } from "zod";

const nativeChangesSchema = z.array(
  z.object({
    path: z.string(),
    type: z.enum(["create", "update", "delete"]),
  }),
);

export type RepositoryFileEvent = z.infer<typeof nativeChangesSchema>[number];
export type RepositoryWatchListener = (
  error: unknown,
  events: readonly RepositoryFileEvent[],
) => void;
export type RepositoryWatchLease = { close(): Promise<void> };

function notify(
  listeners: ReadonlySet<RepositoryWatchListener>,
  error: unknown,
  events: readonly RepositoryFileEvent[],
) {
  const current = [...listeners];
  for (const receive of current) receive(error, events);
}

type SharedWatch = {
  listeners: Set<RepositoryWatchListener>;
  ready: Promise<AsyncSubscription>;
};

export class RepositoryWatchPool {
  private readonly recursive = new Map<string, SharedWatch>();
  private readonly parents = new Map<string, SharedWatch>();

  async recursiveRoot(
    root: string,
    ignoredPaths: readonly string[],
    listener: RepositoryWatchListener,
  ): Promise<RepositoryWatchLease> {
    const ignore = [...new Set(ignoredPaths)].toSorted();
    const key = JSON.stringify([root, ignore]);
    let entry = this.recursive.get(key);
    if (!entry) {
      const listeners = new Set([listener]);
      const ready = subscribe(
        root,
        (error, events) => {
          if (error) {
            notify(listeners, error, []);
            return;
          }
          const parsed = nativeChangesSchema.safeParse(events);
          if (parsed.success) notify(listeners, null, parsed.data);
          else
            notify(listeners, new Error("The native file watcher returned unreadable events."), []);
        },
        { ignore },
      );
      entry = { listeners, ready };
      this.recursive.set(key, entry);
    } else entry.listeners.add(listener);
    return this.lease(this.recursive, key, entry, listener);
  }

  async parentDirectory(
    root: string,
    listener: RepositoryWatchListener,
  ): Promise<RepositoryWatchLease> {
    let entry = this.parents.get(root);
    if (!entry) {
      const listeners = new Set([listener]);
      const ready = new Promise<AsyncSubscription>((resolve, reject) => {
        try {
          const handle = watch(root, (_event, filename) => {
            const file = filename ? path.join(root, filename.toString()) : root;
            notify(listeners, null, [{ path: file, type: "update" }]);
          });
          handle.on("error", (error) => {
            handle.close();
            if (this.parents.get(root) === entry) this.parents.delete(root);
            notify(listeners, error, []);
          });
          resolve({
            unsubscribe: async () => {
              handle.close();
            },
          });
        } catch (cause) {
          reject(cause);
        }
      });
      entry = { listeners, ready };
      this.parents.set(root, entry);
    } else entry.listeners.add(listener);
    return this.lease(this.parents, root, entry, listener);
  }

  private async lease(
    entries: Map<string, SharedWatch>,
    key: string,
    entry: SharedWatch,
    listener: RepositoryWatchListener,
  ): Promise<RepositoryWatchLease> {
    try {
      await entry.ready;
    } catch (cause) {
      entry.listeners.delete(listener);
      if (entries.get(key) === entry) entries.delete(key);
      throw cause;
    }

    let closed = false;
    return {
      close: async () => {
        if (closed) return;
        closed = true;
        entry.listeners.delete(listener);
        if (entry.listeners.size) return;
        if (entries.get(key) === entry) entries.delete(key);
        await (await entry.ready).unsubscribe();
      },
    };
  }
}
