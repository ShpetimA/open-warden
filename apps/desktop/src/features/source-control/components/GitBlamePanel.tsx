import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { X } from "lucide-react";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ErrorState, ErrorNotice } from "@/components/ui/error-state";
import { selectHistoryPullRequestCommit } from "@/features/source-control/actions";
import { desktop } from "@/platform/desktop";
import type { GitBlameResult } from "@/platform/desktop";
import { failureFromUnknown, type DesktopFailure } from "@/platform/desktop/failure";

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
  const [error, setError] = useState<DesktopFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setBusy(true);
    void desktop.getGitBlame(repoPath, relPath, revision).then(
      (value) => {
        if (!active) return;
        setBusy(false);
        if (value.ok) {
          setResult(value.value);
          setError(null);
        } else {
          setError(value.error);
        }
      },
      (cause) => {
        if (!active) return;
        setBusy(false);
        setError(failureFromUnknown(cause, "getGitBlame"));
      },
    );
    return () => {
      active = false;
    };
  }, [repoPath, relPath, revision, attempt]);

  const recovery = { label: "Retry", onAction: () => setAttempt((value) => value + 1) };

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
      {error && result ? (
        <ErrorNotice title="Couldn’t refresh blame" error={error} busy={busy} recovery={recovery} />
      ) : null}
      {error && !result ? (
        <ErrorState title="Couldn’t load blame" error={error} busy={busy} recovery={recovery} />
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
