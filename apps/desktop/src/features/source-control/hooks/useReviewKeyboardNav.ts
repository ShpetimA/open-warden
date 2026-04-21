import { useAppDispatch } from "@/app/hooks";
import { gitApi } from "@/features/source-control/api";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import type { FileItem } from "@/features/source-control/types";
import { useSimpleFileListKeyboardNav } from "./useSimpleFileListKeyboardNav";

export function useReviewKeyboardNav(regionId = "review-files") {
  const dispatch = useAppDispatch();

  useSimpleFileListKeyboardNav({
    regionId,
    getAllFilePaths: (state) => {
      const { activeRepo, reviewBaseRef, reviewHeadRef } = state.sourceControl;
      const branchFilesArgs =
        activeRepo && reviewBaseRef && reviewHeadRef
          ? {
              repoPath: activeRepo,
              baseRef: reviewBaseRef,
              headRef: reviewHeadRef,
            }
          : null;
      const reviewFiles = branchFilesArgs
        ? gitApi.endpoints.getBranchFiles.select(branchFilesArgs)(state).data
        : undefined;

      return ((reviewFiles ?? []) as FileItem[]).map((file) => file.path);
    },
    getActivePath: (state) => state.sourceControl.reviewActivePath,
    onSelectPath: (path) => {
      dispatch(setReviewActivePath(path));
    },
  });
}
