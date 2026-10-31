import { configureStore } from "@reduxjs/toolkit";
import { act, render, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { expect, it } from "vitest";
import { rootReducer } from "@/app/store";
import { gitApi } from "../api";
import { hostedReposApi } from "@/features/hosted-repos/api";
import { selectReviewFilePath } from "../fileSelection";
import { setReviewActivePath } from "../sourceControlSlice";
import { FileList } from "./FileList";

it("moves selection without reprojecting file data and still applies a later data refresh", async () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (defaults) => defaults().concat(gitApi.middleware, hostedReposApi.middleware),
  });
  const files = Array.from({ length: 2400 }, (_, index) => ({
    path: `src/file-${String(index).padStart(4, "0")}.ts`,
    status: "modified" as const,
  }));
  const statusReads: string[] = [];
  const getStatus = (file: (typeof files)[number]) => {
    statusReads.push(file.path);
    return file.status;
  };
  const view = (rows: typeof files) => (
    <Provider store={store}>
      <FileList
        files={rows}
        mode="review"
        selection={selectReviewFilePath}
        navRegion="file-list-render-test"
        onActivatePath={(path) => store.dispatch(setReviewActivePath(path))}
        getFileStatus={getStatus}
      />
    </Provider>
  );
  const { container, rerender } = render(view(files));
  const host = container.querySelector("file-tree-container");
  expect(statusReads).toHaveLength(2400);
  for (const file of files.slice(0, 15)) {
    act(() => {
      store.dispatch(setReviewActivePath(file.path));
    });
  }
  await waitFor(() =>
    expect(host?.shadowRoot?.querySelector('[aria-selected="true"]')).toHaveAttribute(
      "aria-label",
      "file-0014.ts",
    ),
  );
  expect(container.querySelector("file-tree-container")).toBe(host);
  expect(statusReads).toHaveLength(2400);

  const refreshed = [...files, { path: "src/new-file.ts", status: "modified" as const }];
  rerender(view(refreshed));
  expect(statusReads).toHaveLength(4801);
  act(() => {
    store.dispatch(setReviewActivePath("src/new-file.ts"));
  });
  expect(store.getState().sourceControl.reviewActivePath).toBe("src/new-file.ts");
  expect(statusReads).toHaveLength(4801);
});

it("supports controlled selection without a Redux provider", () => {
  const { container } = render(
    <FileList
      files={[{ path: "src/file.ts" }]}
      mode="tree"
      selection="src/file.ts"
      navRegion="controlled-tree-test"
      onActivatePath={() => undefined}
    />,
  );
  expect(container.querySelector("file-tree-container")).toBeInTheDocument();
});

it("initial selection skips empty directories and files hidden by collapsed parents", () => {
  const activated: string[] = [];
  render(
    <FileList
      files={[{ path: "closed/hidden.ts" }, { path: "empty/" }, { path: "visible.ts" }]}
      mode="tree"
      initialExpansion="closed"
      selectFirstFile
      selection=""
      navRegion="visible-first-selection-test"
      autoFocus={false}
      onActivatePath={(path) => activated.push(path)}
    />,
  );
  expect(activated).toEqual(["visible.ts"]);
});
