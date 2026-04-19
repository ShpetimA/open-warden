import { skipToken } from "@reduxjs/toolkit/query";
import { Copy, ExternalLink, MessageSquarePlus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { MentionConfig } from "@/components/markdown/MarkdownEditor";
import { PullRequestAnchorSnippet } from "@/features/pull-requests/components/PullRequestAnchorSnippet";
import { PullRequestInlineReviewThread } from "@/features/pull-requests/components/PullRequestInlineReviewThread";
import { PullRequestPendingDraftItem } from "@/features/pull-requests/components/PullRequestPendingDraftItem";
import {
  buildPullRequestAnchorAnnotations,
  pullRequestAnchorLabel,
} from "@/features/pull-requests/utils/reviewAnchors";
import { useGetBranchFileVersionsQuery } from "@/features/source-control/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { CommentContext, PullRequestReviewAnchor } from "@/features/source-control/types";
import type { GitProviderId } from "@/platform/desktop";

type PullRequestOverviewAnchorCardProps = {
  providerId?: GitProviderId;
  repoPath: string;
  pullRequestNumber: number;
  compareBaseRef: string;
  compareHeadRef: string;
  anchor: PullRequestReviewAnchor;
  onOpenFile: () => void;
  onPublishPending?: () => void;
  onCopyPending?: () => void;
  onClearPending?: () => void;
  commentMentions?: MentionConfig;
};

export function PullRequestOverviewAnchorCard({
  providerId,
  repoPath,
  pullRequestNumber,
  compareBaseRef,
  compareHeadRef,
  anchor,
  onOpenFile,
  onPublishPending,
  onCopyPending,
  onClearPending,
  commentMentions,
}: PullRequestOverviewAnchorCardProps) {
  const hasCompareRefs = Boolean(compareBaseRef && compareHeadRef);
  const commentContext: CommentContext = {
    kind: "review",
    baseRef: compareBaseRef,
    headRef: compareHeadRef,
  };
  const fileVersionsQuery = useGetBranchFileVersionsQuery(
    hasCompareRefs
      ? {
          repoPath,
          baseRef: compareBaseRef,
          headRef: compareHeadRef,
          relPath: anchor.path,
          previousPath: anchor.previousPath ?? undefined,
        }
      : skipToken,
  );
  const fileVersions = fileVersionsQuery.currentData ?? fileVersionsQuery.data ?? null;
  const oldFile = fileVersions?.oldFile ?? null;
  const newFile = fileVersions?.newFile ?? null;
  const loadingSnippet = hasCompareRefs && !fileVersions && fileVersionsQuery.isFetching;
  const snippetError = fileVersions ? "" : errorMessageFrom(fileVersionsQuery.error, "");
  const hasPendingDrafts = anchor.pendingDrafts.length > 0;
  const annotationItems = buildPullRequestAnchorAnnotations({
    anchors: [anchor],
    repoPath,
    pullRequestNumber,
    compareBaseRef,
    compareHeadRef,
    providerId,
  });

  return (
    <section className="rounded-lg border border-border/70 bg-surface-0 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <div className="truncate text-sm font-medium">{anchor.path}</div>
            <div className="text-muted-foreground text-xs">{pullRequestAnchorLabel(anchor)}</div>
            {hasPendingDrafts ? (
              <div className="rounded-full border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[10px] font-medium text-amber-500 uppercase">
                Pending
              </div>
            ) : (
              <div className="rounded-full border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 text-[10px] font-medium text-emerald-500 uppercase">
                Published
              </div>
            )}
          </div>
          {anchor.previousPath ? (
            <div className="text-muted-foreground mt-1 text-xs">from {anchor.previousPath}</div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onOpenFile}>
            <ExternalLink className="h-3.5 w-3.5" />
            Open file
          </Button>
          {hasPendingDrafts ? (
            <>
              <Button size="sm" className="h-7 px-2 text-xs" onClick={onPublishPending}>
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Publish
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onCopyPending}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={onClearPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-md border border-border/60 bg-background/30">
        {snippetError ? (
          <div className="text-muted-foreground rounded-md border border-border/70 px-3 py-2 text-sm">
            {snippetError}
          </div>
        ) : loadingSnippet ? (
          <div className="text-muted-foreground rounded-md border border-border/70 px-3 py-2 text-sm">
            Loading snippet...
          </div>
        ) : oldFile || newFile ? (
          <PullRequestAnchorSnippet
            oldFile={oldFile}
            newFile={newFile}
            activePath={anchor.path}
            commentContext={commentContext}
            anchor={anchor}
            annotationItems={annotationItems}
            commentMentions={commentMentions}
          />
        ) : (
          <div className="text-muted-foreground rounded-md border border-border/70 px-3 py-2 text-sm">
            Diff snippet unavailable.
          </div>
        )}
      </div>

      {snippetError || (!oldFile && !newFile && !loadingSnippet) ? (
        <div className="mt-3 flex flex-col gap-2.5">
          {anchor.remoteThreads.map((thread) => (
            <PullRequestInlineReviewThread
              key={thread.id}
              providerId={providerId}
              repoPath={repoPath}
              pullRequestNumber={pullRequestNumber}
              thread={thread}
              onOpenFile={onOpenFile}
              mentions={commentMentions}
            />
          ))}

          {anchor.pendingDrafts.map((draft) => (
            <PullRequestPendingDraftItem
              key={draft.id}
              comment={draft}
              variant="overview"
              mentions={commentMentions}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
