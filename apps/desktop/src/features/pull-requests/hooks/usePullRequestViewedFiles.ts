import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useGetPullRequestViewedFilesQuery,
  useSetPullRequestFileViewedMutation,
} from "@/features/hosted-repos/api";

export function usePullRequestViewedFiles({
  repoPath,
  pullRequestNumber,
  headSha,
}: {
  repoPath: string;
  pullRequestNumber: number;
  headSha: string;
}) {
  const [deviceViewedPaths, setDeviceViewedPaths] = useState<string[]>([]);
  const [setViewed, { isLoading: changingViewed }] = useSetPullRequestFileViewedMutation();
  const queryArg = repoPath && pullRequestNumber > 0 ? { repoPath, pullRequestNumber } : skipToken;
  const { viewedFiles } = useGetPullRequestViewedFilesQuery(queryArg, {
    selectFromResult: ({ data }) => ({ viewedFiles: data }),
  });
  const deviceKey = `open-warden:pr-viewed:${repoPath}:${pullRequestNumber}:${headSha}`;

  useEffect(() => {
    if (viewedFiles?.storage !== "device" || !headSha) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(deviceKey) ?? "[]");
      setDeviceViewedPaths(
        Array.isArray(saved)
          ? saved.filter((path): path is string => typeof path === "string")
          : [],
      );
    } catch {
      setDeviceViewedPaths([]);
    }
  }, [deviceKey, headSha, viewedFiles?.storage]);

  const viewedPaths = new Set(
    viewedFiles?.storage === "device" ? deviceViewedPaths : (viewedFiles?.viewedPaths ?? []),
  );

  async function toggleViewed(path: string) {
    if (!path || !viewedFiles || changingViewed) return;
    const viewed = !viewedPaths.has(path);
    if (viewedFiles.storage === "device") {
      const next = new Set(deviceViewedPaths);
      if (viewed) next.add(path);
      else next.delete(path);
      const paths = Array.from(next);
      try {
        localStorage.setItem(deviceKey, JSON.stringify(paths));
        setDeviceViewedPaths(paths);
      } catch {
        toast.error("Viewed files could not be saved on this device.");
      }
      return;
    }
    try {
      await setViewed({ repoPath, pullRequestNumber, path, viewed }).unwrap();
    } catch (cause) {
      toast.error(
        cause && typeof cause === "object" && "message" in cause
          ? String(cause.message)
          : "Could not update viewed file.",
      );
    }
  }

  return { viewedFiles, viewedPaths, changingViewed, toggleViewed };
}
