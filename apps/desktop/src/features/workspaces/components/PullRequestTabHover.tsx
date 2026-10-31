import { useGetPullRequestConversationQuery } from "@/features/hosted-repos/api";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { PullRequestWorkspace } from "../workspacesSlice";

/** Mounted only once the pointer opens the card; cached conversation data is reused. */
export function PullRequestTabHover({ workspace }: { workspace: PullRequestWorkspace }) {
  const { detail, isLoading, error } = useGetPullRequestConversationQuery(
    {
      repoPath: workspace.repoPath,
      pullRequestNumber: workspace.pullRequestNumber,
    },
    {
      selectFromResult: ({ data, isLoading, error }) => ({
        detail: data?.detail,
        isLoading,
        error,
      }),
    },
  );

  return (
    <div className="flex max-h-[60vh] min-w-0 flex-col gap-2 overflow-y-auto text-left leading-relaxed">
      <p className="text-muted-foreground break-words">
        {workspace.owner}/{workspace.repo} ·{" "}
        {workspace.providerId === "bitbucket" ? "Bitbucket" : "GitHub"} · #
        {workspace.pullRequestNumber}
      </p>
      <p className="font-medium whitespace-pre-wrap break-words">
        {detail?.title ?? workspace.title}
      </p>
      {detail ? (
        <>
          <dl className="border-border grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t pt-2">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="capitalize">{detail.isDraft ? "Draft" : detail.state}</dd>
            <dt className="text-muted-foreground">Author</dt>
            <dd className="break-words">
              {detail.author?.displayName ?? detail.author?.login ?? "Unknown"}
            </dd>
            <dt className="text-muted-foreground">Branches</dt>
            <dd className="break-words">
              <span>{detail.headRef}</span> → <span>{detail.baseRef}</span>
            </dd>
          </dl>
          {detail.body ? (
            <p className="border-border whitespace-pre-wrap break-words border-t pt-2">
              {detail.body}
            </p>
          ) : null}
        </>
      ) : error ? (
        <p className="text-muted-foreground">
          {errorMessageFrom(error, "Pull request details could not be loaded.")}
        </p>
      ) : isLoading ? (
        <p role="status" className="text-muted-foreground">
          Loading pull request details…
        </p>
      ) : null}
    </div>
  );
}
