import { useEffect } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router";
import { useAppDispatch } from "@/app/hooks";
import { openPullRequestWorkspace } from "@/features/workspaces/actions";
import { buildPullRequestPreviewPath } from "@/features/pull-requests/utils";
import { desktop } from "@/platform/desktop";

export function GuidanceNavigation() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  useEffect(
    () =>
      desktop.onGuidanceNavigate((target) => {
        void (async () => {
          const opened = await dispatch(
            openPullRequestWorkspace({ ...target, title: target.title }),
          );
          if (opened) navigate(`${buildPullRequestPreviewPath(target)}/guidance`);
        })().catch(() => {
          toast.error("The guidance workspace could not be opened.");
        });
      }),
    [dispatch, navigate],
  );
  return null;
}
