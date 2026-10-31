import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { useAppSelector } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import type { HistoryGraphCommit } from "@/platform/desktop/history";
import type { GraphNavigation } from "../historyGraphNavigation";
import { graphRefLabel } from "../historyGraph";

export function HistoryGraphInspector({
  model,
  shallow,
  onOpen,
  renderDetails,
}: {
  model: GraphNavigation;
  shallow: boolean;
  onOpen: (commitId: string) => void;
  renderDetails?: (commit: HistoryGraphCommit) => ReactNode;
}) {
  const selected = useAppSelector(
    (state) => model.byId.get(state.historyGraphUi.commitId)?.row.commit,
  );
  const [open, setOpen] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [selected?.commitId]);
  if (!selected) return null;
  const ancestry =
    selected.parents.length > 1
      ? `Merge · ${selected.parents.length} parents`
      : selected.parents.length
        ? "1 parent"
        : shallow
          ? "Root or shallow boundary"
          : "Root commit";

  return (
    <section
      aria-label="Selected commit details"
      className={`flex shrink-0 flex-col border-t ${open ? "h-64 max-h-[42%]" : "h-8"}`}
    >
      <div className="bg-surface-toolbar flex h-8 shrink-0 items-center gap-2 px-3">
        <Button
          size="xs"
          variant="ghost"
          className="mr-auto"
          aria-expanded={open}
          aria-controls="history-commit-details"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown /> : <ChevronRight />}Commit details
        </Button>
        <span className="text-muted-foreground hidden text-[11px] @min-[700px]:inline">
          J/K to move · Enter to open
        </span>
        <Button size="xs" variant="outline" onClick={() => onOpen(selected.commitId)}>
          Open changes
          <ArrowRight />
        </Button>
      </div>
      {open ? (
        <div
          ref={contentRef}
          id="history-commit-details"
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
        >
          <h2 className="text-sm font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {selected.summary || "(no commit message)"}
          </h2>
          {selected.refs.length ? (
            <p className="text-muted-foreground mt-1 text-[11px] font-mono break-words [overflow-wrap:anywhere]">
              {selected.refs.map(graphRefLabel).join(" · ")}
            </p>
          ) : null}
          <p className="text-muted-foreground mt-1 text-[11px]">{ancestry}</p>
          {renderDetails ? (
            renderDetails(selected)
          ) : (
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              <dt>Commit</dt>
              <dd className="font-mono break-all">{selected.commitId}</dd>
              <dt>Author</dt>
              <dd className="break-words">
                {selected.author} &lt;{selected.authorEmail}&gt;
              </dd>
              <dt>Authored</dt>
              <dd className="tabular-nums">{selected.authoredAt}</dd>
            </dl>
          )}
        </div>
      ) : null}
    </section>
  );
}
