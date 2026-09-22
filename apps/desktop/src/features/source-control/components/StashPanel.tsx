import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { desktop } from "@/platform/desktop";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";
import { useGetGitStashPatchQuery } from "../gitOperationsApi";

export function StashPanel({
  repoPath,
  stashes,
  busy,
  run,
}: {
  repoPath: string;
  stashes: GitRepositoryState["stashes"];
  busy: boolean;
  run: (command: GitCommand) => Promise<void>;
}) {
  const [message, setMessage] = useState("");
  const [includeUntracked, setIncludeUntracked] = useState(true);
  const [selected, setSelected] = useState("");
  const {
    currentData: patch,
    error,
    isFetching,
  } = useGetGitStashPatchQuery({ repoPath, oid: selected }, { skip: !selected });
  const exists = stashes.some((stash) => stash.oid === selected);
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">
        Stashes <span className="text-muted-foreground tabular-nums">({stashes.length})</span>
      </h3>
      <label className="block space-y-1 text-xs">
        Stash name
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Work in progress"
        />
      </label>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={includeUntracked}
            onCheckedChange={(checked) => setIncludeUntracked(checked === true)}
          />
          Include untracked files
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !message.trim()}
          onClick={() => void run({ kind: "stash-save", message, includeUntracked })}
        >
          Save stash
        </Button>
      </div>
      {stashes.length ? (
        <div className="max-h-36 overflow-y-auto rounded-md border">
          {stashes.map((stash) => (
            <button
              key={stash.oid}
              type="button"
              aria-pressed={selected === stash.oid}
              onClick={() => setSelected(stash.oid)}
              className={`block w-full truncate px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring ${selected === stash.oid ? "bg-surface-active" : "hover:bg-accent"}`}
            >
              {stash.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">No saved stashes.</p>
      )}
      {exists ? (
        <>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => void run({ kind: "stash-apply", oid: selected })}
            >
              Apply & keep
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void run({ kind: "stash-pop", oid: selected })}
            >
              Apply & remove
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                void desktop
                  .confirm(
                    "Delete this saved stash? Its saved changes will no longer be available from the stash list.",
                    { title: "Delete stash", kind: "warning", okLabel: "Delete" },
                  )
                  .then((confirmed) => {
                    if (confirmed) return run({ kind: "stash-drop", oid: selected });
                  });
              }}
            >
              Delete
            </Button>
          </div>
          <pre
            aria-label="Stash diff"
            className="bg-surface-inset max-h-64 overflow-auto rounded-md border p-3 font-mono text-[11px]"
          >
            {isFetching
              ? "Loading stash…"
              : error
                ? "Unable to load stash diff."
                : patch || "No text changes."}
          </pre>
        </>
      ) : null}
    </section>
  );
}
