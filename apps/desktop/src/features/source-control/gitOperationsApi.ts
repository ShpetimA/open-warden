import { hasRepositoryEventBridge } from "./repositoryFreshness";
import { queryResult } from "@/platform/desktop/failure";
import { desktop } from "@/platform/desktop";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";
import { gitApi } from "./api";
import { hostedReposApi } from "@/features/hosted-repos/api";

export const gitOperationsApi = gitApi.injectEndpoints({
  endpoints: (builder) => ({
    getGitStashPatch: builder.query<string, { repoPath: string; oid: string }>({
      async queryFn({ repoPath, oid }) {
        return queryResult(await desktop.getGitStashPatch(repoPath, oid));
      },
    }),
    getGitRepositoryState: builder.query<GitRepositoryState, string>({
      async queryFn(repoPath) {
        return queryResult(await desktop.getGitRepositoryState(repoPath));
      },
      providesTags: (_data, _error, repoPath) => [{ type: "RepositoryState", id: repoPath }],
    }),
    runGitCommand: builder.mutation<string, { repoPath: string; command: GitCommand }>({
      async queryFn({ repoPath, command }, { dispatch }) {
        try {
          return queryResult(await desktop.runGitCommand(repoPath, command));
        } finally {
          if (!hasRepositoryEventBridge()) {
            dispatch(
              gitApi.util.invalidateTags([
                { type: "Snapshot", id: repoPath },
                { type: "RepoFiles", id: repoPath },
                { type: "Branches", id: repoPath },
                { type: "HistoryCommits", id: repoPath },
                "FileVersions",
                "BranchFiles",
              ]),
            );
            dispatch(hostedReposApi.util.invalidateTags(["PullRequests"]));
          }
        }
      },
    }),
  }),
});
export const { useGetGitStashPatchQuery, useGetGitRepositoryStateQuery, useRunGitCommandMutation } =
  gitOperationsApi;
