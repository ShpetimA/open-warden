import { configureStore } from "@reduxjs/toolkit";
import { act, render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { createMemoryRouter, RouterProvider, useLocation } from "react-router";
import { expect, it } from "vitest";
import { reduceWorkspaceState } from "../workspaceState";
import {
  repoWorkspaceUpserted,
  pullRequestWorkspaceUpserted,
  workspaceActivated,
  workspaceRemoved,
} from "../workspacesSlice";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

function Location() {
  const location = useLocation();
  return (
    <>
      <WorkspaceNavigation />
      <output>{location.pathname}</output>
    </>
  );
}

it("restores each workspace route, keeps Settings transient and reconciles active PR close", async () => {
  const store = configureStore({ reducer: reduceWorkspaceState });
  store.dispatch(repoWorkspaceUpserted({ repoPath: "/a" }));
  const router = createMemoryRouter([{ path: "*", element: <Location /> }]);
  render(
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>,
  );
  await act(() => router.navigate("/history"));
  expect(screen.getByRole("status")).toHaveTextContent("/history");
  await act(() =>
    store.dispatch(
      pullRequestWorkspaceUpserted({
        repoPath: "/b",
        providerId: "github",
        owner: "acme",
        repo: "b",
        pullRequestNumber: 3,
        title: "Fix",
      }),
    ),
  );
  const id = store.getState().workspaces.activeWorkspaceId;
  await act(() => router.navigate("/pull-requests/github/acme/b/3/files"));
  await act(() => store.dispatch(workspaceActivated({ id: "/a" })));
  expect(screen.getByRole("status")).toHaveTextContent("/history");
  await act(() => router.navigate("/settings"));
  expect(store.getState().workspaces.locations["/a"]).toBe("/history");
  await act(() => store.dispatch(workspaceActivated({ id })));
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests/github/acme/b/3/files");
  await act(() => store.dispatch(workspaceRemoved({ id })));
  expect(screen.getByRole("status")).toHaveTextContent("/pull-requests");
  expect(store.getState().sourceControl.activeRepo).toBe("/b");
});
