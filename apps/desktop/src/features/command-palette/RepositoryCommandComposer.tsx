import { useEffect, useRef, useState } from "react";
import { FolderOpen, LoaderCircle } from "lucide-react";
import { useHotkey } from "@tanstack/react-hotkeys";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { openRepo } from "@/features/source-control/actions";
import { repoLabel, repoParentPath } from "@/features/source-control/utils";
import { desktop } from "@/platform/desktop";
import type { DirectoryListing } from "@/platform/desktop/contracts";

import { CommandComposerCards } from "./CommandComposerCards";
import { CommandComposerLayout, useCommandComposerRootRef } from "./CommandComposerLayout";
import { CommandComposerChoiceStep } from "./CommandComposerChoiceStep";
import type { ComposerChoice } from "./CommandComposerChoiceStep";
import { usePullRequestLinkChoice } from "./usePullRequestLinkChoice";
import { useCommandComposerHotkeys } from "./useCommandComposerHotkeys";

export function RepositoryCommandComposer({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const recentRepos = useAppSelector((state) => state.sourceControl.recentRepos);
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const [pane, setPane] = useState<"choice" | "execute">("choice");
  const [query, setQuery] = useState("");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [listing, setListing] = useState<{ query: string; result: DirectoryListing } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const rootRef = useCommandComposerRootRef();
  const searchRef = useRef<HTMLInputElement>(null);
  const runningRef = useRef(false);

  const { choice: linkChoice, openLink } = usePullRequestLinkChoice(query, onClose);
  const pathMode = query.startsWith("/") || query === "~" || query.startsWith("~/");
  const slash = query.lastIndexOf("/");
  const directory = query === "~" ? "~/" : query.slice(0, slash + 1);
  const prefix = query === "~" ? "" : query.slice(slash + 1);
  const result = listing?.query === directory ? listing.result : null;
  const folders = result?.ok
    ? result.entries.filter(
        (entry) =>
          entry.name.toLowerCase().startsWith(prefix.toLowerCase()) &&
          (!entry.name.startsWith(".") || prefix.startsWith(".")),
      )
    : [];
  const candidate = result?.ok ? `${result.path === "/" ? "" : result.path}/${prefix}` : null;
  const choices: ComposerChoice[] = linkChoice
    ? [linkChoice]
    : pathMode
      ? [
          ...(candidate
            ? [
                {
                  id: `open:${candidate}`,
                  label: `Open ${candidate}`,
                  detail: "Open this repository",
                },
              ]
            : []),
          ...(result?.ok && result.parentPath !== result.path
            ? [{ id: `browse:${result.parentPath}`, label: "..", detail: "Parent folder" }]
            : []),
          ...folders.map((folder) => ({
            id: `browse:${folder.path}`,
            label: folder.name,
            detail: folder.path,
          })),
        ]
      : recentRepos
          .filter((repo) => repo.toLowerCase().includes(query.trim().toLowerCase()))
          .map((repo) => ({
            id: `open:${repo}`,
            label: repoLabel(repo),
            detail: `${repoParentPath(repo)}${repo === activeRepo ? " · Open" : ""}`,
          }));
  const activeChoice = choices.find((choice) => choice.id === highlightedId) ?? choices[0];
  const previewPath =
    pane === "choice" && activeChoice?.id.startsWith("open:")
      ? activeChoice.id.slice(5)
      : selectedPath;

  useEffect(() => {
    if (pane === "choice") searchRef.current?.focus();
    else rootRef.current?.focus({ preventScroll: true });
  }, [pane, rootRef]);

  useEffect(() => {
    if (pane !== "choice" || !pathMode || !directory) return;
    let cancelled = false;
    void desktop.browseDirectory(directory).then(
      (value) => {
        if (!cancelled) setListing({ query: directory, result: value });
      },
      () => {
        if (!cancelled)
          setListing({
            query: directory,
            result: {
              ok: false,
              message: "Directory browsing is unavailable. Choose a folder instead.",
            },
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pane, pathMode, directory]);

  function browse(path: string) {
    setQuery(path.endsWith("/") ? path : `${path}/`);
    setHighlightedId(null);
    setError("");
  }

  function selectChoice(id: string) {
    if (id === linkChoice?.id) {
      openLink();
      return;
    }
    if (id.startsWith("browse:")) {
      browse(id.slice(7));
      return;
    }
    if (id.startsWith("open:")) {
      void run(id.slice(5));
    }
  }

  function goBack() {
    if (busy) return;
    onBack();
  }

  async function chooseFolder() {
    if (busy) return;
    setError("");
    try {
      const path = await desktop.selectFolder();
      if (path) await run(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not choose a folder.");
    }
  }

  async function run(path: string) {
    if (pane !== "choice" || !path || runningRef.current) return;
    runningRef.current = true;
    setSelectedPath(path);
    setBusy(true);
    setError("");
    setPane("execute");
    try {
      if (await dispatch(openRepo(path))) onClose();
      else {
        setError("This folder could not be opened as a Git repository.");
        setPane("choice");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not open this repository.");
      setPane("choice");
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  }

  useCommandComposerHotkeys({
    rootRef,
    searchRef,
    pane,
    query,
    enabledChoiceIds: choices.map((choice) => choice.id),
    activeChoiceId: activeChoice?.id,
    canRun: false,
    hasError: Boolean(error),
    busy,
    onHighlight: setHighlightedId,
    onSelect: selectChoice,
    onBack: goBack,
    onClose,
    onRun: () => {},
  });

  useHotkey(
    "Mod+Enter",
    (event) => {
      if (pane !== "choice" || !candidate) return;
      event.preventDefault();
      selectChoice(`open:${candidate}`);
    },
    { target: rootRef, ignoreInputs: false },
  );

  return (
    <CommandComposerLayout pane={pane}>
      <CommandComposerCards
        pane={pane}
        actionLabel="Open repository"
        previewAction="open-repository"
        operandLabel="Repository"
        operandValue={previewPath ? repoLabel(previewPath) : "Choose a folder"}
        operandIcon={FolderOpen}
        onActionPress={goBack}
        onOperandPress={() => {
          if (pane === "choice" && activeChoice) selectChoice(activeChoice.id);
        }}
      />
      <div className="change-composer-panel">
        <div className="change-composer-panel-heading">
          <p className="change-composer-panel-title">
            {pane === "choice" ? "Choose repository" : "Opening repository"}
          </p>
          <Button variant="ghost" size="sm" onClick={goBack} disabled={busy}>
            Back
          </Button>
        </div>
        {pane === "choice" ? (
          <>
            <CommandComposerChoiceStep
              pane="choice"
              action="open-repository"
              operandLabel="Repository"
              choiceSearchLabel="repositories"
              query={query}
              choices={choices}
              matchingCount={choices.length}
              activeChoiceId={activeChoice?.id}
              busy={busy}
              searchRef={searchRef}
              onQueryChange={(value) => {
                setQuery(value);
                setHighlightedId(null);
                setError("");
              }}
              onHighlight={setHighlightedId}
              onSelect={selectChoice}
              searchLabel="Repository name, directory path, or pull request URL"
              searchPlaceholder="Search repositories, type ~/proj/…, or paste a PR link"
              choiceIcon={FolderOpen}
              onSearchKeyDown={(event) => {
                if (event.key === "Tab" && !event.shiftKey && folders.length) {
                  event.preventDefault();
                  const selected = folders.find(
                    (folder) => `browse:${folder.path}` === activeChoice?.id,
                  );
                  browse((selected ?? folders[0]!).path);
                }
              }}
            />
            {pathMode && !result ? (
              <p className="change-composer-help text-muted-foreground text-xs">Loading folders…</p>
            ) : null}
            {pathMode && result && !result.ok ? (
              <p role="alert" className="text-destructive text-xs">
                {result.message}
              </p>
            ) : null}
            <Button variant="outline" size="sm" onClick={() => void chooseFolder()} disabled={busy}>
              <FolderOpen className="size-4" /> Choose folder…
            </Button>
          </>
        ) : (
          <div className="change-composer-execution" role="status">
            <LoaderCircle className="size-5 animate-spin" /> Opening {repoLabel(selectedPath)}…
          </div>
        )}
        {error ? (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        ) : null}
        <div className="change-composer-footer">
          <span>
            <Kbd>↑↓</Kbd> Choose
          </span>
          <span>
            <Kbd>↵</Kbd> Open or browse
          </span>
          <span>
            <Kbd>Esc</Kbd> Back
          </span>
        </div>
      </div>
    </CommandComposerLayout>
  );
}
