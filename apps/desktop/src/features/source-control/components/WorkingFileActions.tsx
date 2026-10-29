import { RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";

export function WorkingFileActions({
  dirty,
  saving,
  reloading,
  removing = false,
  hasError,
  onSave,
  onReload,
}: {
  dirty: boolean;
  saving: boolean;
  reloading: boolean;
  removing?: boolean;
  hasError: boolean;
  onSave: () => void;
  onReload: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span role="status" className="text-muted-foreground text-[11px]">
        {removing
          ? "Moving to Trash…"
          : reloading
            ? "Reloading…"
            : saving
              ? "Saving…"
              : dirty
                ? "Unsaved"
                : "Saved"}
      </span>
      {dirty || hasError ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={saving || reloading || removing}
          aria-label="Reload file from disk"
          onClick={onReload}
        >
          <RotateCcw className="size-3" />
        </Button>
      ) : null}
      <Button
        size="xs"
        variant="secondary"
        disabled={!dirty || saving || reloading || removing}
        onClick={onSave}
      >
        <Save className="size-3" /> Save <Kbd>⌘S</Kbd>
      </Button>
    </div>
  );
}
