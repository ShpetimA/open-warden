import type { Workspace } from "./workspacesSlice";

export function workspacePath(workspace: Workspace): string {
  if (workspace.kind === "repo") {
    return "/changes";
  }
  return `/pull-requests/${workspace.providerId}/${workspace.owner}/${workspace.repo}/${workspace.pullRequestNumber}/overview`;
}

export function isRouteWithinWorkspace(pathname: string, workspace: Workspace): boolean {
  if (workspace.kind === "repo") {
    return ["/changes", "/changes/files", "/history", "/review", "/pull-requests"].includes(
      pathname,
    );
  }
  const base = workspacePath(workspace).replace(/\/overview$/, "");
  return pathname === base || pathname.startsWith(`${base}/`);
}
