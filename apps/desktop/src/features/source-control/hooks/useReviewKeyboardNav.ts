import { useAppDispatch } from "@/app/hooks";
import { setReviewActivePath } from "@/features/source-control/sourceControlSlice";
import { useSimpleFileListKeyboardNav } from "./useSimpleFileListKeyboardNav";

export function useReviewKeyboardNav(regionId = "review-files") {
  const dispatch = useAppDispatch();

  useSimpleFileListKeyboardNav({
    regionId,
    onSelectPath: (path) => {
      dispatch(setReviewActivePath(path));
    },
  });
}
