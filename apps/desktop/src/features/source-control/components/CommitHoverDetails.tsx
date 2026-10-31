import { skipToken } from "@reduxjs/toolkit/query";

import { useAppSelector } from "@/app/hooks";
import { useGetCommitDetailsQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";

export function CommitHoverDetails({ commitId, summary }: { commitId: string; summary: string }) {
  const repoPath = useAppSelector((state) => state.sourceControl.activeRepo);
  const { currentData: details, error } = useGetCommitDetailsQuery(
    repoPath && commitId ? { repoPath, commitId } : skipToken,
  );

  return (
    <div className="flex max-h-[60vh] min-w-0 flex-col gap-2 overflow-y-auto text-left text-xs leading-relaxed">
      <p className="font-medium whitespace-pre-wrap break-words">{details?.summary ?? summary}</p>
      <p className="text-muted-foreground font-mono text-[11px] break-all">{commitId}</p>
      {details ? (
        <>
          {details.body ? <p className="whitespace-pre-wrap break-words">{details.body}</p> : null}
          <dl className="border-border grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-2">
            <dt className="text-muted-foreground">Author</dt>
            <dd className="break-words">
              {details.author} &lt;{details.authorEmail}&gt;
            </dd>
            <dt className="text-muted-foreground">Authored</dt>
            <dd className="tabular-nums">{details.authoredAt}</dd>
            <dt className="text-muted-foreground">Committer</dt>
            <dd className="break-words">
              {details.committer} &lt;{details.committerEmail}&gt;
            </dd>
            <dt className="text-muted-foreground">Committed</dt>
            <dd className="tabular-nums">{details.committedAt}</dd>
            <dt className="text-muted-foreground">Parents</dt>
            <dd className="font-mono text-[11px] whitespace-pre-wrap break-all">
              {details.parents.join("\n") || "Root commit"}
            </dd>
          </dl>
        </>
      ) : error ? (
        <p className="text-muted-foreground">
          {errorMessageFrom(error, "Commit details could not be loaded.")}
        </p>
      ) : (
        <p role="status" className="text-muted-foreground">
          Loading commit details…
        </p>
      )}
    </div>
  );
}
