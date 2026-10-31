import { ChevronDown, ChevronRight, GitCommitHorizontal } from "lucide-react";
import { useId, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  message: string;
  stagedCount: number | undefined;
  busy: boolean;
  canCommit: boolean;
  amending: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onMessage: (message: string) => void;
  onSubmit: () => void;
  options: ReactNode;
};

export function CommitComposer(props: Props) {
  const contentId = useId();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? Boolean(props.stagedCount || props.message || props.amending);
  const Chevron = open ? ChevronDown : ChevronRight;
  let status = "Loading status…";
  let submitLabel = "Commit";

  if (props.amending) submitLabel = "Amend";
  if (props.busy) submitLabel = "Working…";

  if (props.stagedCount !== undefined) {
    status = props.stagedCount ? `${props.stagedCount} staged` : "Stage files to commit";
  }

  return (
    <section aria-label="Commit changes" className="shrink-0 border-b px-2 py-1">
      <Button
        variant="ghost"
        className="h-10 w-full min-w-0 justify-start gap-2 px-1 text-xs"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setExpanded(!open)}
      >
        <Chevron className="size-3.5 shrink-0" />
        <GitCommitHorizontal className="size-3.5 shrink-0" />
        <span>{props.amending ? "Amend commit" : "Commit"}</span>
        <span className="text-muted-foreground ml-auto min-w-0 truncate font-normal tabular-nums">
          {!open && props.message ? props.message.split("\n")[0] : status}
        </span>
      </Button>
      <div id={contentId} hidden={!open} className="space-y-2 pb-2">
        <Textarea
          ref={props.inputRef}
          aria-label="Commit message"
          value={props.message}
          disabled={props.busy}
          onChange={(event) => props.onMessage(event.target.value)}
          placeholder="Summary, then an optional description"
          rows={2}
          className="min-h-14 resize-y text-xs"
        />
        <div className="flex flex-wrap items-start justify-between gap-2">
          <details className="group min-w-0 flex-1 text-xs">
            <summary
              aria-label="Commit options"
              className="text-muted-foreground focus-visible:ring-ring flex min-h-8 cursor-pointer items-center rounded px-1 focus-visible:ring-2"
            >
              <ChevronRight
                className="mr-1 size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                aria-hidden="true"
              />
              Options
            </summary>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2">{props.options}</div>
          </details>
          <Button size="sm" disabled={!props.canCommit} onClick={props.onSubmit}>
            {submitLabel}
            <Kbd>⌘↵</Kbd>
          </Button>
        </div>
        {!props.stagedCount && !props.amending ? (
          <p className="text-muted-foreground text-[11px]">
            Stage files from Changes. Your message stays saved here.
          </p>
        ) : null}
      </div>
    </section>
  );
}
