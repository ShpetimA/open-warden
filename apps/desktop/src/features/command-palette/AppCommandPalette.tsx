import { useEffect, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { ChangeCommandComposer } from "./ChangeCommandComposer";
import type { ComposerAction } from "./commandComposerModel";
import { specialActions } from "./commandComposerModel";
import { isPullRequestAction } from "./commandComposerModel";
import { RepositoryCommandComposer } from "./RepositoryCommandComposer";
import { CreatePullRequestComposer } from "./CreatePullRequestComposer";
import { PullRequestCommandComposer } from "./PullRequestCommandComposer";
import { BlameCommandComposer } from "./BlameCommandComposer";
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
  const [specialAction, setSpecialAction] = useState<ComposerAction | null>(
    initialAction && specialActions.has(initialAction) ? initialAction : null,
  );
  useEffect(() => {
    setSpecialAction(initialAction && specialActions.has(initialAction) ? initialAction : null);
  }, [open, initialAction]);

  useHotkey(
    "Mod+K",
    (event) => {
      event.preventDefault();
      onOpenChange(!open);
    },
    {
      ignoreInputs: false,
      preventDefault: false,
      stopPropagation: false,
    },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="command-composer-dialog top-0 max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] translate-y-0 border-0 bg-transparent p-0 shadow-none sm:max-w-[560px]"
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">Command composer</DialogTitle>
        <DialogDescription className="sr-only">
          Choose an action and any required details. Changes to Git or pull requests require
          confirmation.
        </DialogDescription>
        {open ? (
          specialAction === "open-repository" ? (
            <RepositoryCommandComposer
              onBack={() => setSpecialAction(null)}
              onClose={() => onOpenChange(false)}
            />
          ) : specialAction === "blame-file" ? (
            <BlameCommandComposer
              onBack={() => setSpecialAction(null)}
              onClose={() => onOpenChange(false)}
            />
          ) : specialAction === "create-pr" ? (
            <CreatePullRequestComposer
              onBack={() => setSpecialAction(null)}
              onClose={() => onOpenChange(false)}
            />
          ) : isPullRequestAction(specialAction) ? (
            <PullRequestCommandComposer
              action={specialAction}
              initialPullRequest={initialPullRequest}
              onBack={() => setSpecialAction(null)}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <ChangeCommandComposer
              initialAction={
                specialAction
                  ? null
                  : initialAction && !specialActions.has(initialAction)
                    ? initialAction
                    : null
              }
              onClose={() => onOpenChange(false)}
              onOpenSpecial={setSpecialAction}
            />
          )
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
