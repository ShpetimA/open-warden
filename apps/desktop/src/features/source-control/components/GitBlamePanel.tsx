import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { selectHistoryPullRequestCommit } from "@/features/source-control/actions";
import { desktop } from "@/platform/desktop";
import type { GitBlameResult } from "@/platform/desktop";

export function GitBlamePanel({
  repoPath,
  relPath,
  revision,
  onClose,
}: {
  repoPath: string;
  relPath: string;
  revision?: string | null;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [result, setResult] = useState<GitBlameResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void desktop.getGitBlame(repoPath, relPath, revision).then(
      (value) => {
        if (active) setResult(value);
      },
      (cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load blame.");
      },
    );
    return () => {
      active = false;
    };
  }, [repoPath, relPath, revision]);

  return (
    <aside className="bg-surface-toolbar flex h-full w-[340px] min-w-[260px] max-w-[42%] flex-col border-l">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Blame</h2>
          <p className="text-muted-foreground truncate text-xs" title={relPath}>
            {relPath}
          </p>
        </div>
        <Button variant="ghost" size="icon-xs" aria-label="Close blame" onClick={onClose}>
          <X />
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-destructive p-3 text-xs">
          {error}
        </p>
      ) : !result ? (
        <p className="text-muted-foreground p-3 text-xs">Loading blame…</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {result.lines.map((item) => (
            <button
              key={item.line}
              type="button"
              disabled={/^0+$/.test(item.commitId)}
              className="hover:bg-surface-inset focus-visible:bg-surface-inset flex w-full min-w-0 items-start gap-2 border-b px-3 py-2 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring"
              title={`${item.summary} · ${item.authoredAt ?? "unknown date"}`}
              onClick={() => {
                void dispatch(selectHistoryPullRequestCommit(item.commitId));
                navigate(`/history?commit=${item.commitId}`);
              }}
            >
              <span className="text-muted-foreground w-9 shrink-0 text-right font-mono tabular-nums">
                {item.line}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{item.author || "Unknown"}</span>
                <span className="text-muted-foreground block truncate">
                  {/^0+$/.test(item.commitId)
                    ? "Working tree"
                    : item.summary || item.commitId.slice(0, 8)}
                </span>
              </span>
              <code className="text-muted-foreground shrink-0">{item.commitId.slice(0, 8)}</code>
            </button>
          ))}
          {result.truncated ? (
            <p className="text-muted-foreground p-3 text-xs">Showing the first 5,000 lines.</p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
