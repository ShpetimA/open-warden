import { gitApi } from "@/features/source-control/api";
import { getBranchCommits, getBranchFiles } from "@/features/source-control/services/git";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import type { CommitFileGroup } from "./commitFileGroups";

const MAX_CONCURRENT_GIT_READS = 4;

const commitFileGroupsApi = gitApi.injectEndpoints({
  endpoints: (builder) => ({
    getCommitFileGroups: builder.query<
      CommitFileGroup[],
      {
        repoPath: string;
        baseRef: string;
        headRef: string;
      }
    >({
      async queryFn({ repoPath, baseRef, headRef }, { signal }) {
        try {
          const commits = await getBranchCommits(repoPath, baseRef, headRef);
          const groups: CommitFileGroup[] = [];

          for (let index = 0; index < commits.length; index += MAX_CONCURRENT_GIT_READS) {
            signal.throwIfAborted();
            const batch = commits.slice(index, index + MAX_CONCURRENT_GIT_READS);
            const loaded = await Promise.all(
              batch.map(async (commit) => ({
                commit,
                files: await getBranchFiles(repoPath, `${commit.commitId}^`, commit.commitId),
              })),
            );
            groups.push(...loaded);
          }

          signal.throwIfAborted();
          return { data: groups };
        } catch (cause: unknown) {
          return { error: { message: errorMessageFrom(cause, "Could not load files by commit.") } };
        }
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "HistoryCommits", id: repoPath }],
    }),
  }),
});

export const { useGetCommitFileGroupsQuery } = commitFileGroupsApi;
