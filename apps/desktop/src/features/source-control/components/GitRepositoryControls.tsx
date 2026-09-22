import { StashPanel } from "./StashPanel";
import { useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGetGitRepositoryStateQuery, useRunGitCommandMutation } from "../gitOperationsApi";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";

export function GitRepositoryControls({ repoPath }: { repoPath: string }) {
  const [open, setOpen] = useState(false);
  const {
    currentData: state,
    error,
    refetch,
  } = useGetGitRepositoryStateQuery(repoPath, { pollingInterval: 15000, refetchOnFocus: true });
  const [execute, mutation] = useRunGitCommandMutation({ fixedCacheKey: repoPath });
  const [message, setMessage] = useState("");
  const run = async (command: GitCommand) => {
    setMessage("");
    const result = await execute({ repoPath, command });
    if ("data" in result) setMessage("Done.");
  };
  const failure = mutation.error ?? error;
  const errorMessage = failure && "message" in failure ? String(failure.message) : "";
  const busy = mutation.isLoading;
  return (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="min-w-0 flex-1 justify-start px-0 text-xs"
          onClick={() => setOpen(true)}
          title="Branches and remote operations"
        >
          <GitBranch className="size-3.5" />
          <span className="truncate">{state?.branch || "Branches"}</span>
          {state?.upstream ? (
            <span className="text-muted-foreground ml-auto shrink-0 tabular-nums">
              ↑{state.ahead} ↓{state.behind}
            </span>
          ) : null}
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Fetch remote changes"
          aria-label="Fetch remote changes"
          disabled={busy || !state?.remotes.length}
          onClick={() => {
            if (state?.remotes.length === 1 && state.remotes[0])
              void run({ kind: "fetch", remote: state.remotes[0] });
            else setOpen(true);
          }}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title="Pull (fast-forward only)"
          aria-label="Pull (fast-forward only)"
          disabled={busy || !state?.upstream || !state.behind}
          onClick={() => void run({ kind: "pull" })}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          title={state?.upstream ? "Push commits" : "Publish branch"}
          aria-label={state?.upstream ? "Push commits" : "Publish branch"}
          disabled={busy || !state?.branch}
          onClick={() => (state?.upstream ? void run({ kind: "push" }) : setOpen(true))}
        >
          <ArrowUp />
        </Button>
      </div>
      {errorMessage ? (
        <p role="alert" className="text-destructive break-words text-xs">
          {errorMessage}
        </p>
      ) : null}
      {busy ? (
        <p role="status" className="text-muted-foreground text-xs">
          Running Git operation…
        </p>
      ) : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Branches & remote</DialogTitle>
            <DialogDescription>{repoPath}</DialogDescription>
          </DialogHeader>
          {state ? (
            <RepositoryActions
              key={repoPath}
              state={state}
              busy={busy}
              run={run}
              repoPath={repoPath}
            />
          ) : (
            <p>Loading repository…</p>
          )}
          {errorMessage ? (
            <p role="alert" className="text-destructive whitespace-pre-wrap text-xs">
              {errorMessage}
            </p>
          ) : (
            <p role="status" className="text-muted-foreground text-xs">
              {message}
            </p>
          )}
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void refetch()}>
            Refresh state
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RepositoryActions({
  state,
  busy,
  run,
  repoPath,
}: {
  state: GitRepositoryState;
  busy: boolean;
  run: (command: GitCommand) => Promise<void>;
  repoPath: string;
}) {
  const [filter, setFilter] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [remote, setRemote] = useState(
    state.remotes.includes("origin") ? "origin" : (state.remotes[0] ?? ""),
  );
  const [selected, setSelected] = useState(state.branch);
  const selectedBranch = state.branches.find((branch) => branch.name === selected);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Select value={remote} onValueChange={setRemote} disabled={busy || !state.remotes.length}>
          <SelectTrigger aria-label="Remote" className="min-w-0 flex-1">
            <SelectValue placeholder="No remotes configured" />
          </SelectTrigger>
          <SelectContent>
            {state.remotes.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !remote}
          onClick={() => void run({ kind: "fetch", remote })}
        >
          Fetch
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !state.upstream || !state.behind}
          onClick={() => void run({ kind: "pull" })}
        >
          Pull ↓{state.behind}
        </Button>
        <Button
          size="sm"
          disabled={busy || !state.branch || !remote}
          onClick={() => void run(state.upstream ? { kind: "push" } : { kind: "publish", remote })}
        >
          {state.upstream ? `Push ↑${state.ahead}` : "Publish branch"}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {state.branch || "Detached HEAD"}
        {state.upstream ? ` → ${state.upstream}` : " · No upstream"} · Pull uses fast-forward only.
      </p>
      <label className="block space-y-1 text-xs">
        Find a branch
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search local and remote branches"
        />
      </label>
      <div
        role="group"
        aria-label="Branches"
        className="max-h-52 overflow-y-auto rounded-md border"
      >
        {state.branches
          .filter((branch) => branch.name.toLowerCase().includes(filter.toLowerCase()))
          .map((branch) => (
            <button
              key={`${branch.remote}:${branch.name}`}
              type="button"
              aria-pressed={selected === branch.name}
              onClick={() => setSelected(branch.name)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs focus-visible:ring-2 focus-visible:ring-ring ${selected === branch.name ? "bg-surface-active" : "hover:bg-accent"}`}
            >
              <GitBranch className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{branch.name}</span>
              <span className="text-muted-foreground shrink-0">
                {branch.name === state.branch && !branch.remote
                  ? "Current"
                  : branch.worktree
                    ? "In worktree"
                    : branch.remote
                      ? "Remote"
                      : "Local"}
              </span>
            </button>
          ))}
      </div>
      {selectedBranch?.worktree && selectedBranch.worktree !== repoPath ? (
        <p className="text-muted-foreground break-all text-xs">
          Checked out in {selectedBranch.worktree}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={
            busy || !selectedBranch || selected === state.branch || Boolean(selectedBranch.worktree)
          }
          onClick={() => {
            if (!selectedBranch) return;
            void run(
              selectedBranch.remote
                ? {
                    kind: "track",
                    remoteBranch: selected,
                    branch: selected.slice(selected.indexOf("/") + 1),
                  }
                : { kind: "switch", branch: selected },
            );
          }}
        >
          Switch branch
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            busy || !selectedBranch || selected === state.branch || Boolean(selectedBranch.worktree)
          }
          onClick={() => {
            if (selectedBranch)
              void run({ kind: "stash-switch", branch: selected, remote: selectedBranch.remote });
          }}
        >
          Stash & switch
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            busy || !selectedBranch || selectedBranch.remote || Boolean(selectedBranch.worktree)
          }
          onClick={() => void run({ kind: "delete", branch: selected })}
        >
          Delete merged branch
        </Button>
      </div>
      <label className="block space-y-1 text-xs">
        Branch name
        <Input
          value={newBranch}
          onChange={(e) => setNewBranch(e.target.value)}
          placeholder="feature/my-change"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !newBranch.trim()}
          onClick={() =>
            void run({ kind: "create", branch: newBranch, startPoint: selected || "HEAD" })
          }
        >
          Create & switch
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy || !newBranch.trim() || !state.branch}
          onClick={() => void run({ kind: "rename", branch: newBranch })}
        >
          Rename current branch
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button
          variant="outline"
          size="sm"
          disabled={busy || Boolean(state.operation) || !selected || selected === state.branch}
          onClick={() => void run({ kind: "merge", branch: selected })}
        >
          Merge selected into current
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            busy ||
            Boolean(state.operation) ||
            !selected ||
            selected === state.branch ||
            !state.branch
          }
          onClick={() => void run({ kind: "rebase", branch: selected })}
        >
          Rebase current onto selected
        </Button>
      </div>
      <StashPanel repoPath={repoPath} stashes={state.stashes} busy={busy} run={run} />
      {(["incoming", "outgoing"] as const).map((direction) =>
        state[direction].length ? (
          <section key={direction}>
            <h3 className="text-xs font-medium capitalize">{direction} commits (up to 30)</h3>
            <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs">
              {state[direction].map((commit) => (
                <li key={commit.id} className="flex gap-2">
                  <code className="text-muted-foreground">{commit.id}</code>
                  <span className="truncate">{commit.subject}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
