import { gitApi } from "@/features/source-control/api";
import { getBranchCommits, getBranchFiles } from "@/features/source-control/services/git";
import { failureFromUnknown } from "@/platform/desktop/failure";
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
          const result = await getBranchCommits(repoPath, baseRef, headRef);
          if (!result.ok) return { error: result.error };
          const commits = result.value;
          const groups: CommitFileGroup[] = [];

          for (let index = 0; index < commits.length; index += MAX_CONCURRENT_GIT_READS) {
            signal.throwIfAborted();
            const batch = commits.slice(index, index + MAX_CONCURRENT_GIT_READS);
            const loaded = await Promise.all(
              batch.map(async (commit) => {
                const files = await getBranchFiles(
                  repoPath,
                  `${commit.commitId}^`,
                  commit.commitId,
                );
                return { commit, files };
              }),
            );
            for (const group of loaded) {
              if (!group.files.ok) return { error: group.files.error };
              groups.push({ commit: group.commit, files: group.files.value });
            }
          }

          signal.throwIfAborted();
          return { data: groups };
        } catch (cause: unknown) {
          return { error: failureFromUnknown(cause, "getCommitFileGroups") };
        }
      },
      providesTags: (_result, _error, { repoPath }) => [{ type: "HistoryCommits", id: repoPath }],
    }),
  }),
});

export const { useGetCommitFileGroupsQuery } = commitFileGroupsApi;
