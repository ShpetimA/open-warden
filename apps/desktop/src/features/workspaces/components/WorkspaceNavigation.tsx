import { useLayoutEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { selectActiveWorkspace, workspaceLocationChanged } from "../workspacesSlice";
import { workspacePath, isRouteWithinWorkspace } from "../workspaceRoutes";

export function WorkspaceNavigation() {
  const workspace = useAppSelector(selectActiveWorkspace);
  const savedPath = useAppSelector((state) =>
    workspace ? state.workspaces.locations[workspace.id] : undefined,
  );
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const previousId = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const id = workspace?.id ?? "";
    if (previousId.current !== id) {
      previousId.current = id;
      navigate(workspace ? (savedPath ?? workspacePath(workspace)) : "/changes", { replace: true });
      return;
    }
    if (workspace && isRouteWithinWorkspace(location.pathname, workspace)) {
      const path = location.pathname + location.search;
      if (path !== savedPath) dispatch(workspaceLocationChanged({ id, path }));
    }
  }, [workspace, savedPath, location.pathname, location.search, navigate, dispatch]);
  return null;
}
