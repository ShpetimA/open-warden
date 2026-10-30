import { useId, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { FolderOpen, GitBranch, GitFork, X } from "lucide-react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { openRepo } from "@/features/source-control/actions";
import { desktop } from "@/platform/desktop";
import { repositorySetupSchema } from "@/platform/desktop/repositoryManagement";
import {
  desktopFailure,
  failureFromUnknown,
  type DesktopFailure,
} from "@/platform/desktop/failure";

export function RepositorySetupForm({
  mode,
  onBack,
  onClose,
  onBusyChange,
}: {
  mode: "clone" | "init";
  onBack: () => void;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const dispatch = useAppDispatch();
  const destinationId = useId();

  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [branch, setBranch] = useState("main");
  const [preparedPath, setPreparedPath] = useState("");
  const [error, setError] = useState<DesktopFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const running = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const clone = mode === "clone";
  const label = clone ? "Clone repository" : "Initialize repository";

  useHotkey(
    "Escape",
    () => {
      if (!running.current) onClose();
    },
    { target: form, ignoreInputs: false },
  );

  async function chooseFolder() {
    const result = await desktop.selectFolder();

    if (!result.ok) setError(result.error);
    else if (result.value)
      setDestination(clone ? `${result.value.replace(/[\\/]$/, "")}/new-repository` : result.value);
  }

  async function submit() {
    if (running.current) return;

    const parsed = repositorySetupSchema.safeParse(
      clone
        ? { kind: "clone", source, destination }
        : { kind: "init", destination, initialBranch: branch },
    );

    if (!parsed.success) {
      setError(
        desktopFailure(
          "setupRepository",
          "invalid-input",
          parsed.error.issues[0]?.message ?? "Check the repository details.",
        ),
      );

      return;
    }

    running.current = true;
    setBusy(true);
    onBusyChange(true);
    setError(null);

    try {
      const result = preparedPath
        ? { ok: true as const, value: preparedPath }
        : await desktop.setupRepository(parsed.data);

      if (!result.ok) {
        setError(result.error);

        return;
      }

      setPreparedPath(result.value);

      if (await dispatch(openRepo(result.value))) onClose();
      else
        setError(
          desktopFailure(
            "openRepository",
            "unavailable",
            "The repository is ready, but could not be opened. Try opening it again.",
          ),
        );
    } catch (cause) {
      setError(failureFromUnknown(cause, "setupRepository"));
    } finally {
      running.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <form
      ref={form}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="bg-background flex max-h-[calc(100vh-3rem)] flex-col overflow-y-auto rounded-lg border p-4 shadow-lg"
    >
      <header className="mb-4 flex items-start gap-3">
        {clone ? <GitFork className="mt-0.5 size-4" /> : <GitBranch className="mt-0.5 size-4" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">{label}</h2>
          <p className="text-muted-foreground mt-1 text-xs">
            {clone
              ? "Download a repository and open it as a project."
              : "Start Git tracking in a new or existing folder. Existing files stay in place."}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close repository setup"
          disabled={busy}
          onClick={onClose}
        >
          <X />
        </Button>
      </header>

      <fieldset disabled={busy || Boolean(preparedPath)} className="flex min-w-0 flex-col gap-3">
        {clone ? (
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Repository URL
            <Input
              autoFocus
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder="https://bitbucket.org/workspace/repository.git"
              required
              className="text-xs"
            />
            <span className="text-muted-foreground text-[11px] font-normal">
              HTTPS uses your saved GitHub/Bitbucket connection when available. SSH uses your
              Git/SSH configuration.
            </span>
          </label>
        ) : null}
        <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium">
          <label htmlFor={destinationId}>
            {clone ? "Destination folder" : "Repository folder"}
          </label>
          <div className="flex min-w-0 gap-2">
            <Input
              id={destinationId}
              autoFocus={!clone}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="~/projects/my-repository"
              required
              className="min-w-0 text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={() => void chooseFolder()}>
              <FolderOpen />
              Browse…
            </Button>
          </div>
          {clone ? (
            <span className="text-muted-foreground text-[11px] font-normal">
              Choose a new folder name inside an existing parent folder.
            </span>
          ) : null}
        </div>
        {!clone ? (
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            Initial branch
            <Input
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              required
              className="text-xs"
            />
          </label>
        ) : null}
      </fieldset>

      {error ? (
        <div className="mt-3">
          <ActionError
            title={preparedPath ? "Couldn’t open the repository" : `${label} couldn’t finish`}
            error={error}
          />
        </div>
      ) : null}

      {busy ? (
        <p role="status" className="text-muted-foreground mt-3 flex items-center gap-2 text-xs">
          <Spinner />
          {preparedPath
            ? "Opening repository…"
            : clone
              ? "Cloning repository… This can take a few minutes."
              : "Initializing repository…"}
        </p>
      ) : null}

      <footer className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onBack}>
          Back
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {preparedPath ? "Open repository" : label}
        </Button>
      </footer>
    </form>
  );
}
