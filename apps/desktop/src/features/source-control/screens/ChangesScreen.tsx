import { skipToken } from "@reduxjs/toolkit/query";

import { useAppSelector } from "@/app/hooks";
import { DiffWorkspace } from "@/features/diff-view/DiffWorkspace";
import { useGetFileVersionsQuery } from "@/features/source-control/api";
import { useChangesKeyboardNav } from "@/features/source-control/hooks/useChangesKeyboardNav";
import { usePrefetchChangesDiffs } from "@/features/source-control/hooks/usePrefetchNearbyDiffs";
import { useChangesSync } from "@/features/source-control/hooks/useChangesSync";
import { useThrottledDiffSelection } from "@/features/source-control/hooks/useThrottledDiffSelection";
import { errorMessageFrom } from "@/features/source-control/shared-utils/errorMessage";
import { useGetGitSnapshotQuery } from "@/features/source-control/api";
import type { BucketedFile } from "@/features/source-control/types";

export function ChangesScreen() {
  useChangesKeyboardNav();
  useChangesSync();

  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo);
  const activeBucket = useAppSelector((state) => state.sourceControl.activeBucket);
  const activePath = useAppSelector((state) => state.sourceControl.activePath);
  const collapseStaged = useAppSelector((state) => state.sourceControl.collapseStaged);
  const collapseUnstaged = useAppSelector((state) => state.sourceControl.collapseUnstaged);
  const { data: snapshotData } = useGetGitSnapshotQuery(activeRepo, { skip: !activeRepo });
  const snapshot = activeRepo ? snapshotData : undefined;

  const visibleRows: BucketedFile[] = [
    ...(collapseStaged
      ? []
      : (snapshot?.staged ?? []).map((file) => ({ ...file, bucket: "staged" as const }))),
    ...(collapseUnstaged
      ? []
      : [
          ...(snapshot?.unstaged ?? []).map((file) => ({ ...file, bucket: "unstaged" as const })),
          ...(snapshot?.untracked ?? []).map((file) => ({ ...file, bucket: "untracked" as const })),
        ]),
  ];

  usePrefetchChangesDiffs(visibleRows, activeRepo, activeBucket, activePath);

  const previewSelection = useThrottledDiffSelection(
    activePath
      ? {
          bucket: activeBucket,
          path: activePath,
        }
      : null,
  );

  const workingFileVersions = useGetFileVersionsQuery(
    activeRepo && previewSelection
      ? { repoPath: activeRepo, bucket: previewSelection.bucket, relPath: previewSelection.path }
      : skipToken,
    {
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const fileVersions = workingFileVersions.data;
  const loadingPatch = workingFileVersions.isFetching;
  const oldFile = fileVersions?.oldFile ?? null;
  const newFile = fileVersions?.newFile ?? null;
  const errorMessage = errorMessageFrom(workingFileVersions.error, "");
  const previewPath = previewSelection?.path ?? "";

  return (
    <div className="grid h-full min-h-0 min-w-0">
      <section className="flex h-full min-h-0 min-w-0 flex-col">
        <div className="min-h-0 min-w-0 flex-1">
          {errorMessage ? (
            <div className="text-destructive p-3 text-sm">{errorMessage}</div>
          ) : loadingPatch ? (
            <div className="text-muted-foreground p-3 text-sm">Loading diff...</div>
          ) : !activePath ? (
            <div className="text-muted-foreground p-3 text-sm">Select a file to view diff.</div>
          ) : !oldFile && !newFile ? (
            <div className="text-muted-foreground p-3 text-sm">No diff content.</div>
          ) : (
            <DiffWorkspace
              oldFile={oldFile}
              newFile={newFile}
              activePath={previewPath}
              commentContext={{ kind: "changes" }}
              canComment
            />
          )}
        </div>
      </section>
    </div>
  );
}
