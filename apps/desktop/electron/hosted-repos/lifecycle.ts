import type {
  PullRequestLifecycleInput,
  PullRequestLifecycleResult,
} from "../../src/platform/desktop/contracts";
import {
  bitbucketPullRequestPath,
  bitbucketRequest,
  fetchBitbucketPullRequest,
} from "../bitbucket-repo";
import { fetchGitHubPullRequest, githubGraphqlRequest, githubJsonRequest } from "../github-repo";
import { resolvePullRequestContext } from "./pullRequests";

type GraphqlPullRequestResult = {
  data?: {
    revertPullRequest?: { revertPullRequest?: { url?: string } };
  };
};

export async function runPullRequestLifecycle(
  input: PullRequestLifecycleInput,
): Promise<PullRequestLifecycleResult> {
  if (!input.expectedHeadSha.trim())
    throw new Error("Load the pull request head before changing it.");
  const { hostedRepo, connection } = await resolvePullRequestContext(input);
  if (hostedRepo.providerId === "github") {
    const current = await fetchGitHubPullRequest(
      hostedRepo,
      connection.token,
      input.pullRequestNumber,
    );
    if (current.head.sha !== input.expectedHeadSha)
      throw new Error("The pull request changed. Refresh and review the latest commit first.");
    const path = `/repos/${encodeURIComponent(hostedRepo.owner)}/${encodeURIComponent(hostedRepo.repo)}/pulls/${input.pullRequestNumber}`;
    const nodeId = current.node_id;
    const ensureNodeId = () => {
      if (!nodeId) throw new Error("GitHub did not return this pull request's ID.");
      return nodeId;
    };
    switch (input.action) {
      case "edit": {
        if (!input.title.trim()) throw new Error("A pull request title is required.");
        if (current.title !== input.expectedTitle || (current.body ?? "") !== input.expectedBody)
          throw new Error("The pull request description changed. Refresh before editing it.");
        await githubJsonRequest(path, connection.token, {
          method: "PATCH",
          body: { title: input.title.trim(), body: input.body.trim() },
        });
        break;
      }
      case "close":
      case "reopen": {
        if (input.action === "close" && current.state !== "open")
          throw new Error("This pull request is already closed.");
        if (input.action === "reopen" && (current.state !== "closed" || current.merged_at))
          throw new Error("Only an unmerged closed pull request can be reopened.");
        await githubJsonRequest(path, connection.token, {
          method: "PATCH",
          body: { state: input.action === "close" ? "closed" : "open" },
        });
        break;
      }
      case "draft":
      case "ready": {
        if (current.state !== "open" || current.draft !== (input.action === "ready"))
          throw new Error("The pull request draft state has changed. Refresh it first.");
        const mutation =
          input.action === "draft" ? "convertPullRequestToDraft" : "markPullRequestReadyForReview";
        await githubGraphqlRequest(
          connection.token,
          `mutation($id: ID!) { ${mutation}(input: { pullRequestId: $id }) { pullRequest { id } } }`,
          { id: ensureNodeId() },
        );
        break;
      }
      case "update-branch": {
        if (current.state !== "open")
          throw new Error("Only an open pull request can update its branch.");
        await githubJsonRequest(`${path}/update-branch`, connection.token, {
          method: "PUT",
          body: { expected_head_sha: input.expectedHeadSha },
        });
        break;
      }
      case "auto-merge": {
        if (current.state !== "open" || current.draft)
          throw new Error("This pull request is not ready for auto-merge.");
        await githubGraphqlRequest(
          connection.token,
          `mutation($id: ID!, $method: PullRequestMergeMethod!) { enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $method }) { pullRequest { id } } }`,
          { id: ensureNodeId(), method: input.method.toUpperCase() },
        );
        break;
      }
      case "revert": {
        if (!current.merged_at) throw new Error("Only a merged pull request can be reverted.");
        const result = await githubGraphqlRequest<GraphqlPullRequestResult>(
          connection.token,
          `mutation($id: ID!) { revertPullRequest(input: { pullRequestId: $id }) { revertPullRequest { url } } }`,
          { id: ensureNodeId() },
        );
        return {
          createdPullRequestUrl: result.data?.revertPullRequest?.revertPullRequest?.url ?? null,
        };
      }
    }
    return { createdPullRequestUrl: null };
  }

  if (hostedRepo.providerId === "bitbucket") {
    const current = await fetchBitbucketPullRequest(
      hostedRepo,
      connection,
      input.pullRequestNumber,
    );
    if (current.source?.commit?.hash !== input.expectedHeadSha)
      throw new Error("The pull request changed. Refresh and review the latest commit first.");
    const path = bitbucketPullRequestPath(hostedRepo, input.pullRequestNumber);
    if (input.action === "edit") {
      if (!input.title.trim()) throw new Error("A pull request title is required.");
      if (
        current.title !== input.expectedTitle ||
        (current.description ?? "") !== input.expectedBody
      )
        throw new Error("The pull request description changed. Refresh before editing it.");
      await bitbucketRequest(path, connection, {
        method: "PUT",
        body: { title: input.title.trim(), description: input.body.trim() },
      });
      return { createdPullRequestUrl: null };
    }
    if (input.action === "close") {
      if (current.state !== "OPEN") throw new Error("This pull request is already closed.");
      await bitbucketRequest(`${path}/decline`, connection, { method: "POST" });
      return { createdPullRequestUrl: null };
    }
    throw new Error(`Bitbucket does not support ${input.action.replaceAll("-", " ")} here.`);
  }
  throw new Error("This provider does not support pull request lifecycle actions yet.");
}
