import { gitApi } from "@/features/source-control/api";
import { configureStore } from "@reduxjs/toolkit";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { expect, it, vi } from "vitest";
import { rootReducer } from "@/app/store";
import { WorkspaceTabBar } from "./WorkspaceTabBar";
import { WorkspaceContent } from "./WorkspaceContent";
import { WorkspaceNavigation } from "./WorkspaceNavigation";
import {
  projectActivated,
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceLocationChanged,
} from "../workspacesSlice";

function Shell() {
  const location = useLocation();
  return (
    <>
      <WorkspaceNavigation />
      <WorkspaceTabBar />
      <WorkspaceContent>
        <output>{location.pathname}</output>
      </WorkspaceContent>
    </>
  );
}

it("keeps reviews inside their project and hides the inner strip on ordinary screens", async () => {
  Element.prototype.scrollIntoView = vi.fn();
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefault) => getDefault().concat(gitApi.middleware),
  });
  store.dispatch(repoWorkspaceUpserted({ repoPath: "/projects/alpha" }));
  store.dispatch(
    pullRequestWorkspaceUpserted({
      repoPath: "/projects/alpha",
      providerId: "github",
      owner: "acme",
      repo: "alpha",
      pullRequestNumber: 7,
      title: "Polish",
    }),
  );
  const reviewId = store.getState().workspaces.activeWorkspaceId;
  store.dispatch(
    workspaceLocationChanged({ id: reviewId, path: "/pull-requests/github/acme/alpha/7/files" }),
  );
  store.dispatch(repoWorkspaceUpserted({ repoPath: "/projects/beta" }));
  const router = createMemoryRouter([{ path: "*", element: <Shell /> }]);
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  const projects = screen.getByRole("navigation", { name: "Open projects" });
  expect(within(projects).queryByRole("button", { name: /#7/ })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("navigation", { name: "Project pull requests" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(projects).getByRole("button", { name: "alpha, /projects" }));
  expect(
    await screen.findByRole("navigation", { name: "Project pull requests" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests/github/acme/alpha/7/files");
  fireEvent.click(screen.getByRole("button", { name: "Pull requests", exact: true }));
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests");
  fireEvent.keyDown(document, {
    key: "ArrowRight",
    code: "ArrowRight",
    ctrlKey: true,
    altKey: true,
  });
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests");
  fireEvent.keyDown(document, {
    key: "}",
    code: "BracketRight",
    ctrlKey: true,
    shiftKey: true,
  });
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests/github/acme/alpha/7/files");
  fireEvent.keyDown(document, { key: "{", code: "BracketLeft", ctrlKey: true, shiftKey: true });
  expect(store.getState().workspaces.activeWorkspaceId).toBe("/projects/alpha");
  fireEvent.keyDown(document, { key: "9", code: "Digit9", ctrlKey: true });
  expect(store.getState().sourceControl.activeRepo).toBe("/projects/beta");
  fireEvent.keyDown(document, { key: "1", code: "Digit1", ctrlKey: true });
  expect(store.getState().sourceControl.activeRepo).toBe("/projects/alpha");
  await act(() => router.navigate("/history"));
  expect(
    screen.queryByRole("navigation", { name: "Project pull requests" }),
  ).not.toBeInTheDocument();
  await act(() => store.dispatch(projectActivated({ repoPath: "/projects/beta" })));
  await act(() => store.dispatch(projectActivated({ repoPath: "/projects/alpha" })));
  expect(screen.getByRole("status")).toHaveTextContent("/history");
  await act(() => router.navigate("/pull-requests"));
  fireEvent.click(screen.getByRole("button", { name: "#7 Polish", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Close #7 Polish", exact: true }));
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests");
  expect(
    screen.queryByRole("navigation", { name: "Project pull requests" }),
  ).not.toBeInTheDocument();
  expect(store.getState().sourceControl.activeRepo).toBe("/projects/alpha");
});
