import { useLayoutEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { ChangeCommandComposer } from "./ChangeCommandComposer";
import type { ComposerAction } from "./commandComposerModel";
import { specialActions } from "./commandComposerModel";
import { isPullRequestAction } from "./commandComposerModel";
import { RepositoryCommandComposer } from "./RepositoryCommandComposer";
import { RepositorySetupForm } from "@/features/repository-setup/RepositorySetupForm";
import { RepositoryRemotes } from "@/features/source-control/components/RepositoryRemotes";
import { CreatePullRequestComposer } from "./CreatePullRequestComposer";
import { PullRequestCommandComposer } from "./PullRequestCommandComposer";
import { BlameCommandComposer } from "./BlameCommandComposer";
import { CommandComposerLayoutHost } from "./CommandComposerLayout";
import type { PullRequestSummary } from "@/platform/desktop/contracts";

type AppCommandPaletteProps = {
  open: boolean;
  initialAction?: ComposerAction | null;
  initialPullRequest?: PullRequestSummary | null;
  onOpenChange: (open: boolean) => void;
};

export function AppCommandPalette({
  open,
  initialAction,
  initialPullRequest,
  onOpenChange,
}: AppCommandPaletteProps) {
  const [specialAction, setSpecialAction] = useState<ComposerAction | "pull-requests" | null>(
    initialAction && specialActions.has(initialAction)
      ? initialAction
      : initialPullRequest
        ? "pull-requests"
        : null,
  );
  const opener = useRef<HTMLElement | null>(null);
  const [prefillPullRequest, setPrefillPullRequest] = useState(true);
  const [locked, setLocked] = useState(false);

  useLayoutEffect(() => {
    if (!open) setLocked(false);
    else if (document.activeElement instanceof HTMLElement) opener.current = document.activeElement;

    setPrefillPullRequest(true);
    setSpecialAction(
      initialAction && specialActions.has(initialAction)
        ? initialAction
        : initialPullRequest
          ? "pull-requests"
          : null,
    );
  }, [open, initialAction, initialPullRequest]);

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();

      if (!locked) onOpenChange(!open);
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  const defaultAction = initialAction && !specialActions.has(initialAction) ? initialAction : null;
  let commandAction = defaultAction;

  if (specialAction && specialAction !== "pull-requests" && !specialActions.has(specialAction)) {
    commandAction = specialAction;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!locked) onOpenChange(value);
      }}
    >
      <DialogContent
        className="command-composer-dialog top-0 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] translate-y-0 border-0 bg-transparent p-0 shadow-none sm:max-w-[680px]"
        showCloseButton={false}
        contentAnimated={false}
        onCloseAutoFocus={(event) => {
          if (!opener.current?.isConnected) return;

          event.preventDefault();
          opener.current.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">Command composer</DialogTitle>
        <DialogDescription className="sr-only">
          Choose a command or scope, then any required details. Consequential changes require
          confirmation.
        </DialogDescription>
        {open ? (
          <CommandComposerLayoutHost>
            {specialAction === "clone-repository" || specialAction === "init-repository" ? (
              <RepositorySetupForm
                key={specialAction}
                mode={specialAction === "clone-repository" ? "clone" : "init"}
                onBack={() => setSpecialAction("open-repository")}
                onClose={() => onOpenChange(false)}
                onBusyChange={setLocked}
              />
            ) : specialAction === "manage-remotes" ? (
              <RepositoryRemotes
                onBusyChange={setLocked}
                onClose={() => onOpenChange(false)}
                onBack={() => setSpecialAction(null)}
                onFetch={() => setSpecialAction("fetch")}
              />
            ) : specialAction === "open-repository" ? (
              <RepositoryCommandComposer
                onBack={() => setSpecialAction(null)}
                onClose={() => onOpenChange(false)}
                onSetup={(mode) =>
                  setSpecialAction(mode === "clone" ? "clone-repository" : "init-repository")
                }
              />
            ) : specialAction === "blame-file" ? (
              <BlameCommandComposer
                onBack={() => setSpecialAction(null)}
                onClose={() => onOpenChange(false)}
              />
            ) : specialAction === "create-pr" ? (
              <CreatePullRequestComposer
                onBack={() => setSpecialAction("pull-requests")}
                onClose={() => onOpenChange(false)}
              />
            ) : specialAction === "pull-requests" ? (
              <PullRequestCommandComposer
                onBusyChange={setLocked}
                action={null}
                initialPullRequest={prefillPullRequest ? initialPullRequest : null}
                prefillFromWorkspace={prefillPullRequest}
                onCreate={() => {
                  setPrefillPullRequest(false);
                  setSpecialAction("create-pr");
                }}
                onBack={() => {
                  setPrefillPullRequest(true);
                  setSpecialAction(null);
                }}
                onClose={() => onOpenChange(false)}
              />
            ) : specialAction !== null && isPullRequestAction(specialAction) ? (
              <PullRequestCommandComposer
                onBusyChange={setLocked}
                action={specialAction}
                initialPullRequest={initialPullRequest}
                onCreate={() => setSpecialAction("create-pr")}
                onBack={() => setSpecialAction(null)}
                onClose={() => onOpenChange(false)}
              />
            ) : (
              <ChangeCommandComposer
                initialAction={commandAction}
                onClose={() => onOpenChange(false)}
                onOpenSpecial={setSpecialAction}
              />
            )}
          </CommandComposerLayoutHost>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
