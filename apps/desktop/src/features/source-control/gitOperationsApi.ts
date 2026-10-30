import { hasRepositoryEventBridge } from "./repositoryFreshness";
import { desktopFailure, queryResult } from "@/platform/desktop/failure";
import { desktop } from "@/platform/desktop";
import type { GitCommand, GitRepositoryState } from "@/platform/desktop/gitOperations";
import {
  repositoryConfigurationSchema,
  type RepositoryConfiguration,
  type RepositoryConfigurationCommand,
} from "@/platform/desktop/repositoryManagement";
import { gitApi } from "./api";
import { hostedReposApi } from "@/features/hosted-repos/api";

export const gitOperationsApi = gitApi.injectEndpoints({
  endpoints: (builder) => ({
    getRepositoryConfiguration: builder.query<RepositoryConfiguration, string>({
      async queryFn(repoPath) {
        const result = await desktop.getRepositoryConfiguration(repoPath);

        if (!result.ok) return { error: result.error };

        const parsed = repositoryConfigurationSchema.safeParse(result.value);

        return parsed.success
          ? { data: parsed.data }
          : {
              error: desktopFailure(
                "getRepositoryConfiguration",
                "unavailable",
                "The repository configuration could not be read. Refresh to try again.",
              ),
            };
      },
      providesTags: (_data, _error, repoPath) => [{ type: "RepositoryState", id: repoPath }],
    }),
    configureRepository: builder.mutation<
      void,
      { repoPath: string; command: RepositoryConfigurationCommand }
    >({
      async queryFn({ repoPath, command }, { dispatch }) {
        const result = await desktop.configureRepository(repoPath, command);

        if (!hasRepositoryEventBridge()) {
          dispatch(
            gitApi.util.invalidateTags([
              { type: "RepositoryState", id: repoPath },
              { type: "Branches", id: repoPath },
            ]),
          );

          dispatch(
            hostedReposApi.util.invalidateTags([
              { type: "HostedRepo", id: repoPath },
              { type: "PullRequests", id: repoPath },
            ]),
          );
        }

        return queryResult(result);
      },
    }),
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

export const {
  useGetRepositoryConfigurationQuery,
  useConfigureRepositoryMutation,
  useGetGitStashPatchQuery,
  useGetGitRepositoryStateQuery,
  useRunGitCommandMutation,
} = gitOperationsApi;
