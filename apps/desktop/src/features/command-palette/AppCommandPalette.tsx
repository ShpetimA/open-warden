import { useHotkey } from "@tanstack/react-hotkeys";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import { ChangeCommandComposer } from "./ChangeCommandComposer";
import type { ComposerAction } from "./commandComposerModel";

type AppCommandPaletteProps = {
  open: boolean;
  initialAction?: ComposerAction | null;
  onOpenChange: (open: boolean) => void;
};

export function AppCommandPalette({ open, initialAction, onOpenChange }: AppCommandPaletteProps) {
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
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      >
        <DialogTitle className="sr-only">Compose a Git command</DialogTitle>
        <DialogDescription className="sr-only">
          Search Git actions, choose any required details, then confirm the command.
        </DialogDescription>
        {open ? (
          <ChangeCommandComposer
            initialAction={initialAction ?? null}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
