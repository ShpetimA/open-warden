import { desktop } from "@/platform/desktop";
import {
  gitCommandResultSchema,
  gitStateResultSchema,
  type GitCommand,
  type GitRepositoryState,
} from "@/platform/desktop/gitOperations";
import { gitApi } from "./api";
import { hostedReposApi } from "@/features/hosted-repos/api";

export const gitOperationsApi = gitApi.injectEndpoints({
  endpoints: (builder) => ({
    getGitRepositoryState: builder.query<GitRepositoryState, string>({
      async queryFn(repoPath) {
        try {
          const result = gitStateResultSchema.parse(await desktop.getGitRepositoryState(repoPath));
          return result.ok ? { data: result.value } : { error: result.error };
        } catch {
          return {
            error: {
              message:
                "Unable to read repository state. Restart the desktop app if it was just updated.",
            },
          };
        }
      },
      providesTags: (_data, _error, repoPath) => [{ type: "Snapshot", id: repoPath }],
    }),
    runGitCommand: builder.mutation<string, { repoPath: string; command: GitCommand }>({
      async queryFn({ repoPath, command }, { dispatch }) {
        try {
          const result = gitCommandResultSchema.parse(
            await desktop.runGitCommand(repoPath, command),
          );
          return result.ok ? { data: result.value } : { error: result.error };
        } catch {
          return {
            error: {
              message: "Git operation could not be completed. Refresh to check repository state.",
            },
          };
        } finally {
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
      },
    }),
  }),
});
export const { useGetGitRepositoryStateQuery, useRunGitCommandMutation } = gitOperationsApi;
