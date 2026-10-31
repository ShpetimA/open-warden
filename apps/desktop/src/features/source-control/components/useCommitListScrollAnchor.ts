import { useLayoutEffect, useRef } from "react";
import { COMMIT_ROW_HEIGHT } from "@/components/ui/commit-row";
import type { HistoryCommit } from "../types";

type CommitAnchor = {
  commitId: string;
  offset: number;
  filter: string;
  initialCommitId: string | undefined;
};

export function useCommitListScrollAnchor({
  commits,
  scroller,
  filter,
  initialCommitId,
}: {
  commits: readonly HistoryCommit[];
  scroller: HTMLDivElement | null;
  filter: string;
  initialCommitId: string | undefined;
}) {
  const anchor = useRef<CommitAnchor | null>(null);

  useLayoutEffect(() => {
    if (!scroller) return;
    const previous = anchor.current;
    if (previous && previous.filter === filter && previous.initialCommitId === initialCommitId) {
      const index = commits.findIndex((commit) => commit.commitId === previous.commitId);
      if (index >= 0) scroller.scrollTop = index * COMMIT_ROW_HEIGHT + previous.offset;
    }

    function capture() {
      if (!scroller) return;
      const index = Math.floor(scroller.scrollTop / COMMIT_ROW_HEIGHT);
      const commit = commits[index];
      anchor.current = commit
        ? {
            commitId: commit.commitId,
            offset: scroller.scrollTop - index * COMMIT_ROW_HEIGHT,
            filter,
            initialCommitId,
          }
        : null;
    }

    capture();
    scroller.addEventListener("scroll", capture, { passive: true });
    return () => scroller.removeEventListener("scroll", capture);
  }, [commits, scroller, filter, initialCommitId]);
}
