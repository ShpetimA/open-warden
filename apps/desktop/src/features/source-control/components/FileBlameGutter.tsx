import { useNavigate } from "react-router";
import { formatDistanceToNowStrict } from "date-fns";
import type { ReactNode } from "react";
import { ArrowUpRight, Copy } from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch } from "@/app/hooks";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { selectHistoryPullRequestCommit } from "../actions";
import { useGetCommitDetailsQuery, useGetFileBlameQuery } from "../api";
import { groupBlameLines, type BlameGroup } from "../blameGroups";
import { BlameAttribution } from "./BlameAttribution";

type BlameTarget = {
  repoPath: string;
  relPath: string;
  revision?: string | null;
};

export function FileBlameGutter({ target }: { target: BlameTarget }) {
  const blameTarget = {
    repoPath: target.repoPath,
    relPath: target.relPath,
    revision: target.revision,
  };
  const { result } = useGetFileBlameQuery(blameTarget, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
    selectFromResult: ({ currentData }) => ({ result: currentData }),
  });
  const groups = groupBlameLines(result?.lines ?? []);

  return (
    <aside
      aria-label="Line attribution"
      className="bg-surface-toolbar relative min-h-full w-[clamp(136px,24cqw,240px)] shrink-0 self-stretch border-r"
    >
      <BlameReadState target={blameTarget}>
        {result?.lines.length === 0 ? (
          <p className="text-muted-foreground sticky top-0 p-2 text-xs">
            No line attribution available.
          </p>
        ) : (
          <BlameAttribution
            groups={groups}
            renderCommitDetails={(group) => (
              <BlameCommitDetails group={group} repoPath={target.repoPath} />
            )}
          />
        )}
      </BlameReadState>
      {result?.truncated ? (
        <p className="bg-surface-toolbar text-muted-foreground sticky bottom-0 border-t px-2 py-1 text-[11px]">
          Attribution limited to 5,000 lines
        </p>
      ) : null}
    </aside>
  );
}

function BlameReadState({ target, children }: { target: BlameTarget; children: ReactNode }) {
  const { hasData, fetching, error, refetch } = useGetFileBlameQuery(target, {
    selectFromResult: ({ currentData, isFetching, error }) => ({
      hasData: currentData !== undefined,
      fetching: isFetching,
      error,
    }),
  });

  if (!hasData) {
    return (
      <div className="sticky top-0 p-2">
        {error ? (
          <ErrorNotice
            title="Couldn’t load attribution"
            error={error}
            busy={fetching}
            recovery={{ label: "Retry", onAction: () => void refetch() }}
          />
        ) : (
          <p role="status" className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Spinner className="size-3 motion-reduce:animate-none" /> Loading attribution…
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {children}
      {error ? (
        <div className="sticky bottom-0 p-1">
          <ErrorNotice
            title="Couldn’t refresh attribution"
            error={error}
            busy={fetching}
            recovery={{ label: "Retry", onAction: () => void refetch() }}
          />
        </div>
      ) : null}
    </>
  );
}

function BlameCommitDetails({ group, repoPath }: { group: BlameGroup; repoPath: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const {
    currentData: details,
    error,
    isFetching,
    refetch,
  } = useGetCommitDetailsQuery({
    repoPath,
    commitId: group.commitId,
  });
  const date = details?.authoredAt ?? group.authoredAt;
  const parsedDate = date ? new Date(date) : null;
  const validDate = parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate : null;

  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 space-y-3 overflow-y-auto">
        <p className="text-sm font-medium leading-snug break-words [overflow-wrap:anywhere]">
          {details?.summary ?? group.summary}
        </p>
        <div className="space-y-1 text-muted-foreground">
          <p className="break-words [overflow-wrap:anywhere]">
            {details?.author ?? group.author}
            {details?.authorEmail ? ` <${details.authorEmail}>` : ""}
          </p>
          {validDate ? (
            <p title={date ?? undefined}>
              {formatDistanceToNowStrict(validDate, { addSuffix: true })} ·{" "}
              {validDate.toLocaleDateString()}
            </p>
          ) : null}
        </div>
        {details?.body ? (
          <details className="border-t pt-2">
            <summary className="cursor-pointer font-medium">Commit message</summary>
            <p className="mt-2 whitespace-pre-wrap leading-relaxed break-words [overflow-wrap:anywhere]">
              {details.body}
            </p>
          </details>
        ) : null}
        {error ? (
          <ErrorNotice
            title="Couldn’t load full details"
            error={error}
            busy={isFetching}
            recovery={{ label: "Retry", onAction: () => void refetch() }}
          />
        ) : !details ? (
          <p role="status" className="text-muted-foreground">
            Loading commit details…
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex shrink-0 items-center justify-between gap-2 border-t pt-2">
        <Button
          variant="ghost"
          size="xs"
          aria-label="Copy commit hash"
          onClick={() => {
            void navigator.clipboard.writeText(group.commitId).then(
              () => toast.success("Commit hash copied"),
              () => toast.error("Couldn’t copy commit hash"),
            );
          }}
        >
          <Copy className="size-3" />
          <code>{group.commitId.slice(0, 8)}</code>
        </Button>
        <Button
          variant="secondary"
          size="xs"
          onClick={() => {
            void dispatch(selectHistoryPullRequestCommit(group.commitId));
            navigate(`/history?commit=${group.commitId}`);
          }}
        >
          Open commit <ArrowUpRight className="size-3" />
        </Button>
      </div>
    </div>
  );
}
