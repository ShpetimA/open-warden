import { useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { Plus, RefreshCw, X } from "lucide-react";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionError, ErrorNotice, ErrorState } from "@/components/ui/error-state";
import { ListLoadingState } from "@/components/ui/list-loading-state";
import type { DesktopFailure } from "@/platform/desktop/failure";
import {
  repositoryConfigurationCommandSchema,
  type RepositoryConfiguration,
  type RepositoryConfigurationCommand,
} from "@/platform/desktop/repositoryManagement";
import { BranchCombobox } from "./BranchCombobox";
import {
  useConfigureRepositoryMutation,
  useGetRepositoryConfigurationQuery,
} from "../gitOperationsApi";

export function RepositoryRemotes({
  onClose,
  onBack,
  onFetch,
  onBusyChange,
}: {
  onClose: () => void;
  onBack: () => void;
  onFetch: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);

  return (
    <RepositoryRemotesController
      key={repoPath}
      repoPath={repoPath}
      onClose={onClose}
      onBack={onBack}
      onFetch={onFetch}
      onBusyChange={onBusyChange}
    />
  );
}

function RepositoryRemotesController({
  repoPath,
  onClose,
  onBack,
  onFetch,
  onBusyChange,
}: {
  repoPath: string;
  onClose: () => void;
  onBack: () => void;
  onFetch: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const query = useGetRepositoryConfigurationQuery(repoPath, { skip: !repoPath });
  const [configure, mutation] = useConfigureRepositoryMutation();

  const content = query.currentData;

  return (
    <div className="bg-background max-h-[calc(100vh-3rem)] overflow-y-auto rounded-lg border p-4 shadow-lg">
      <header className="mb-4 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Remotes & upstream</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            Choose where this repository fetches and pushes changes.
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh remotes"
          disabled={query.isFetching || mutation.isLoading}
          onClick={() => void query.refetch()}
        >
          <RefreshCw />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close remote settings"
          disabled={mutation.isLoading}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      {!content ? (
        query.error ? (
          <ErrorState
            title="Couldn’t load remotes"
            error={query.error}
            recovery={{ label: "Retry", onAction: () => void query.refetch() }}
          />
        ) : (
          <ListLoadingState label="Loading remotes…" />
        )
      ) : (
        <>
          {query.error ? (
            <ErrorNotice
              title="Couldn’t refresh remotes"
              error={query.error}
              recovery={{ label: "Retry", onAction: () => void query.refetch() }}
            />
          ) : null}
          <RepositoryConfigurationPanel
            configuration={content}
            busy={mutation.isLoading}
            error={mutation.error}
            onFetch={onFetch}
            onDismiss={onClose}
            onRun={async (command) => {
              onBusyChange(true);

              try {
                const result = await configure({ repoPath, command });

                if ("data" in result) {
                  await query.refetch();

                  return true;
                }

                return false;
              } finally {
                onBusyChange(false);
              }
            }}
          />
        </>
      )}

      <footer className="mt-4">
        <Button size="sm" variant="ghost" disabled={mutation.isLoading} onClick={onBack}>
          Back
        </Button>
      </footer>
    </div>
  );
}

type Editing = {
  kind: "add-remote" | "edit-remote" | "edit-push-url" | "rename-remote" | "remove-remote";
  originalName: string;
  revision: string;
};

export function RepositoryConfigurationPanel({
  configuration,
  busy,
  error,
  onRun,
  onFetch,
  onDismiss,
}: {
  configuration: RepositoryConfiguration;
  busy: boolean;
  error?: unknown;
  onRun: (command: RepositoryConfigurationCommand) => Promise<boolean>;
  onFetch: () => void;
  onDismiss?: () => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [upstream, setUpstream] = useState<{ value: string; revision: string } | null>(null);
  const [validation, setValidation] = useState<DesktopFailure | null>(null);
  const [choosingUpstream, setChoosingUpstream] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const running = useRef(false);

  useHotkey(
    "Escape",
    (event) => {
      if (busy) return;

      event.preventDefault();

      if (editing) setEditing(null);
      else onDismiss?.();
    },
    { target: root, ignoreInputs: false, enabled: !choosingUpstream, preventDefault: false },
  );

  function edit(kind: Editing["kind"], remoteName = "") {
    const remote = configuration.remotes.find((item) => item.name === remoteName);

    setEditing({ kind, originalName: remoteName, revision: configuration.revision });
    setName(remoteName || "origin");
    setUrl(kind === "edit-push-url" ? (remote?.pushUrls[0] ?? "") : (remote?.fetchUrls[0] ?? ""));
    setValidation(null);
  }

  async function submit() {
    if (!editing || running.current || busy) return;

    const common = { name: editing.originalName || name, expectedRevision: editing.revision };
    let draft: RepositoryConfigurationCommand;

    switch (editing.kind) {
      case "rename-remote":
        draft = { ...common, kind: editing.kind, newName: name };
        break;
      case "remove-remote":
        draft = { ...common, kind: editing.kind };
        break;
      case "edit-push-url":
        draft = { ...common, kind: editing.kind, url: url.trim() || null };
        break;
      case "add-remote":
      case "edit-remote":
        draft = { ...common, kind: editing.kind, url };
        break;
    }

    const parsed = repositoryConfigurationCommandSchema.safeParse(draft);

    if (!parsed.success) {
      setValidation({
        code: "invalid-input",
        operation: "configureRepository",
        message: parsed.error.issues[0]?.message ?? "Check the remote details.",
      });

      return;
    }

    running.current = true;
    setValidation(null);

    try {
      if (await onRun(parsed.data)) setEditing(null);
    } finally {
      running.current = false;
    }
  }

  async function changeUpstream(value: string | null) {
    if (running.current || busy) return;

    running.current = true;
    setValidation(null);

    try {
      const saved = await onRun({
        kind: "set-upstream",
        branch: configuration.branch,
        upstream: value,
        expectedRevision: value
          ? (upstream?.revision ?? configuration.revision)
          : configuration.revision,
      });

      if (saved) setUpstream(null);
    } finally {
      running.current = false;
    }
  }

  const selectedUpstream = upstream?.value ?? configuration.upstream ?? "";
  const remoteName = editing?.originalName ?? "";
  const editorTitles: Record<Editing["kind"], string> = {
    "add-remote": "Add remote",
    "remove-remote": `Remove ${remoteName}?`,
    "rename-remote": `Rename ${remoteName}`,
    "edit-push-url": `Push URL for ${remoteName}`,
    "edit-remote": `Fetch URL for ${remoteName}`,
  };

  return (
    <div ref={root} className="flex flex-col gap-4">
      <section aria-label="Configured remotes" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium">Remotes</h3>
          <Button size="xs" variant="outline" disabled={busy} onClick={() => edit("add-remote")}>
            <Plus />
            Add remote
          </Button>
        </div>
        {!configuration.remotes.length ? (
          <p className="text-muted-foreground py-2 text-xs">
            No remotes configured. Add one to fetch or publish branches.
          </p>
        ) : (
          configuration.remotes.map((remote) => (
            <div
              key={remote.name}
              role="group"
              aria-label={`Remote ${remote.name}`}
              className="min-w-0 rounded-md border px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-auto text-xs font-semibold">{remote.name}</span>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy || remote.fetchUrls.length > 1}
                  onClick={() => edit("edit-remote", remote.name)}
                >
                  Edit URL
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy || remote.pushUrls.length > 1}
                  onClick={() => edit("edit-push-url", remote.name)}
                >
                  Push URL
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => edit("rename-remote", remote.name)}
                >
                  Rename
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => edit("remove-remote", remote.name)}
                >
                  Remove
                </Button>
              </div>
              {[...new Set(remote.fetchUrls)].map((value) => (
                <p
                  key={value}
                  className="text-muted-foreground mt-1 break-all font-mono text-[11px]"
                >
                  Fetch: {value}
                </p>
              ))}
              {[...new Set(remote.pushUrls)].map((value) => (
                <p
                  key={value}
                  className="text-muted-foreground mt-1 break-all font-mono text-[11px]"
                >
                  Push: {value}
                </p>
              ))}
              {remote.fetchUrls.length > 1 || remote.pushUrls.length > 1 ? (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Multiple URLs are configured. Edit those URLs in Git configuration.
                </p>
              ) : null}
            </div>
          ))
        )}
      </section>

      {editing ? (
        <form
          className="bg-surface-toolbar flex flex-col gap-3 rounded-md border p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <h3 className="text-xs font-semibold">{editorTitles[editing.kind]}</h3>
          <fieldset disabled={busy} className="flex flex-col gap-3">
            {editing.kind === "add-remote" || editing.kind === "rename-remote" ? (
              <label className="flex flex-col gap-1.5 text-xs">
                Remote name
                <Input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="text-xs"
                />
              </label>
            ) : null}
            {editing.kind === "add-remote" ||
            editing.kind === "edit-remote" ||
            editing.kind === "edit-push-url" ? (
              <label className="flex flex-col gap-1.5 text-xs">
                {editing.kind === "edit-push-url" ? "Push URL (optional)" : "Repository URL"}
                <Input
                  autoFocus={editing.kind !== "add-remote"}
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  required={editing.kind !== "edit-push-url"}
                  placeholder="git@bitbucket.org:workspace/repository.git"
                  className="text-xs"
                />
                {editing.kind === "edit-push-url" ? (
                  <span className="text-muted-foreground text-[11px]">
                    Leave empty to push to the fetch URL.
                  </span>
                ) : null}
              </label>
            ) : null}
            {editing.kind === "remove-remote" ? (
              <p className="text-muted-foreground text-xs">
                This removes its local configuration and remote-tracking branches. Your local
                branches and the remote repository remain.
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button
                size="xs"
                variant={editing.kind === "remove-remote" ? "destructive" : "default"}
              >
                {busy
                  ? "Saving…"
                  : editing.kind === "remove-remote"
                    ? "Remove remote"
                    : "Save remote"}
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}

      {validation || error ? (
        <ActionError
          title="Couldn’t update repository settings"
          error={validation ?? error}
          recovery={{
            label: "Review current settings",
            onAction: () => {
              setEditing(null);
              setValidation(null);
            },
          }}
        />
      ) : null}

      <section className="flex flex-col gap-2 border-t pt-3" aria-label="Branch upstream">
        <h3 className="text-xs font-medium">
          {configuration.branch ? `Upstream for ${configuration.branch}` : "No branch checked out"}
        </h3>
        <p className="text-muted-foreground text-xs">
          {configuration.upstream
            ? `Currently tracking ${configuration.upstream}`
            : "This branch has no upstream."}
        </p>
        {configuration.branch ? (
          <>
            {configuration.remoteBranches.length ? (
              <>
                <fieldset disabled={busy || Boolean(editing)}>
                  <BranchCombobox
                    portalContainer={root}
                    onOpenChange={setChoosingUpstream}
                    label="Upstream"
                    value={selectedUpstream}
                    options={configuration.remoteBranches}
                    onChange={(value) => setUpstream({ value, revision: configuration.revision })}
                  />
                </fieldset>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="xs"
                    disabled={
                      busy ||
                      Boolean(editing) ||
                      !selectedUpstream ||
                      selectedUpstream === configuration.upstream
                    }
                    onClick={() => void changeUpstream(selectedUpstream)}
                  >
                    Set upstream
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-xs">
                Fetch remote branches to choose an existing upstream, or use Publish branch to push
                a new one.
              </p>
            )}
            {configuration.upstream ? (
              <Button
                size="xs"
                variant="outline"
                className="self-start"
                disabled={busy || Boolean(editing)}
                onClick={() => void changeUpstream(null)}
              >
                Stop tracking
              </Button>
            ) : null}
            <Button
              size="xs"
              variant="ghost"
              className="self-start"
              disabled={busy || !configuration.remotes.length}
              onClick={onFetch}
            >
              <RefreshCw />
              Fetch branches…
            </Button>
          </>
        ) : null}
      </section>
    </div>
  );
}
