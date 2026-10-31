import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  message: string;
  busy: boolean;
  canCommit: boolean;
  amending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessage: (message: string) => void;
  onSubmit: () => void;
  options: ReactNode;
};

export function CommitComposer(props: Props) {
  let submitLabel = "Commit";

  if (props.amending) submitLabel = "Amend";
  if (props.busy) submitLabel = "Working…";

  return (
    <section aria-label="Commit changes" className="@container shrink-0 space-y-2 border-b p-2">
      <Textarea
        ref={props.inputRef}
        aria-label="Commit message"
        value={props.message}
        disabled={props.busy}
        onChange={(event) => props.onMessage(event.target.value)}
        placeholder="Summary, then an optional description"
        rows={2}
        className="bg-background min-h-14 resize-y text-xs"
      />
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
        {props.options}
        <div className="ml-auto">
          <Button
            size="sm"
            aria-label={`${submitLabel} changes`}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            disabled={!props.canCommit}
            onClick={props.onSubmit}
          >
            {submitLabel}
            <Kbd className="hidden @min-[280px]:inline-flex">⌘↵</Kbd>
          </Button>
        </div>
      </div>
    </section>
  );
}
