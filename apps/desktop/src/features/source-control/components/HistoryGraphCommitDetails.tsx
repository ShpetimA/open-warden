import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useState } from "react";

import { useAppSelector } from "@/app/hooks";
import { ErrorNotice } from "@/components/ui/error-state";
import type { HistoryGraphCommit } from "@/platform/desktop/history";
import { useGetCommitDetailsQuery } from "../api";

export function HistoryGraphCommitDetails({ commit }: { commit: HistoryGraphCommit }) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const [settledId, setSettledId] = useState(commit.commitId);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledId(commit.commitId), 120);
    return () => window.clearTimeout(timer);
  }, [commit.commitId]);
  const settled = settledId === commit.commitId;
  const {
    details: currentDetails,
    error,
    isFetching,
    refetch,
  } = useGetCommitDetailsQuery(
    repoPath && settled ? { repoPath, commitId: commit.commitId } : skipToken,
    {
      selectFromResult: ({ currentData, error, isFetching }) => ({
        details: currentData,
        error,
        isFetching,
      }),
    },
  );
  const details = settled ? currentDetails : undefined;

  return (
    <div className="mt-2 space-y-3 text-xs leading-relaxed">
      {details?.body ? (
        <p className="max-w-[90ch] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {details.body}
        </p>
      ) : null}
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Commit</dt>
        <dd className="select-text font-mono text-[11px] break-all">{commit.commitId}</dd>
        <dt className="text-muted-foreground">Author</dt>
        <dd className="break-words [overflow-wrap:anywhere]">
          {details?.author ?? commit.author} &lt;{details?.authorEmail ?? commit.authorEmail}&gt;
        </dd>
        <dt className="text-muted-foreground">Authored</dt>
        <dd className="tabular-nums">{details?.authoredAt ?? commit.authoredAt}</dd>
        {details ? (
          <>
            <dt className="text-muted-foreground">Committer</dt>
            <dd className="break-words [overflow-wrap:anywhere]">
              {details.committer} &lt;{details.committerEmail}&gt;
            </dd>
            <dt className="text-muted-foreground">Committed</dt>
            <dd className="tabular-nums">{details.committedAt}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Parents</dt>
        <dd className="font-mono text-[11px] whitespace-pre-wrap break-all">
          {(details?.parents ?? commit.parents).join("\n") || "Root commit"}
        </dd>
      </dl>
      {settled && error ? (
        <ErrorNotice
          title="Couldn’t load full commit details"
          error={error}
          busy={isFetching}
          recovery={{
            label: "Retry",
            onAction: () => {
              void refetch();
            },
          }}
        />
      ) : !details ? (
        <p role="status" className="text-muted-foreground">
          Loading full commit details…
        </p>
      ) : null}
    </div>
  );
}
