import type { FileTree as PierreFileTreeModel } from "@pierre/trees";
import { describe, expect, it, vi } from "vitest";

import {
  getPierreFileTreeFocusedBucketedFile,
  getPierreFileTreeVisibleBucketedFiles,
  getPierreFileTreeVisiblePaths,
  movePierreFileTreeFocus,
  movePierreFileTreeFocusFile,
  registerPierreFileTreeNav,
  scrollPierreFileTreePathIntoView,
  unregisterPierreFileTreeNav,
} from "./pierreFileTreeNavigation";

function createModel(expansionState: Record<string, boolean> = {}) {
  const focusPath = vi.fn<(path: string) => void>();
  const focusNearestPath = vi.fn<(path: string | null) => string | null>(
    (path) => path ?? "src/main.ts",
  );
  const getFocusedPath = vi.fn<() => string | null>(() => null);
  const getItem = vi.fn((path: string) => {
    if (!(path in expansionState)) {
      return null;
    }

    return {
      isExpanded: () => expansionState[path],
    };
  });

  return {
    focusNearestPath,
    focusPath,
    getFocusedPath,
    getItem,
    getFileTreeContainer: () => undefined,
  } as unknown as PierreFileTreeModel;
}

describe("peerFileTreeNavigation", () => {
  it("returns visible paths based on expanded directories", () => {
    const model = createModel({ src: true, "src/utils": true });
    const regionId = "repo-files-test-visible";

    registerPierreFileTreeNav(
      regionId,
      [{ path: "README.md" }, { path: "src/main.ts" }, { path: "src/utils/helper.ts" }],
      model,
    );

    expect(getPierreFileTreeVisiblePaths(regionId)).toEqual([
      "src/utils/helper.ts",
      "src/main.ts",
      "README.md",
    ]);

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("hides descendants when a directory is collapsed", () => {
    const model = createModel({ src: false, "src/utils": true });
    const regionId = "repo-files-test-collapsed";

    registerPierreFileTreeNav(
      regionId,
      [{ path: "README.md" }, { path: "src/main.ts" }, { path: "src/utils/helper.ts" }],
      model,
    );

    expect(getPierreFileTreeVisiblePaths(regionId)).toEqual(["README.md"]);

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("focuses the peer tree path when scrolling into view", () => {
    const model = createModel();
    const regionId = "repo-files-test-scroll";

    registerPierreFileTreeNav(regionId, [{ path: "src/main.ts" }], model);

    scrollPierreFileTreePathIntoView(regionId, "src/main.ts");

    expect(model.focusPath).toHaveBeenCalledWith("src/main.ts");

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("moves focus through the peer tree keyboard handler", () => {
    const focusedButton = document.createElement("button");
    focusedButton.dataset.type = "item";
    focusedButton.dataset.itemPath = "src/main.ts";
    focusedButton.dataset.itemFocused = "true";
    const shadowRoot = document.createElement("div").attachShadow({ mode: "open" });
    shadowRoot.append(focusedButton);
    const host = shadowRoot.host as HTMLElement;
    const keydownHandler = vi.fn<(event: KeyboardEvent) => void>();
    focusedButton.addEventListener("keydown", keydownHandler);
    const model = {
      focusNearestPath: vi.fn(() => "src/main.ts"),
      getFileTreeContainer: () => host,
      getFocusedPath: () => "src/main.ts",
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const regionId = "repo-files-test-move-focus";

    registerPierreFileTreeNav(regionId, [{ path: "src/main.ts" }], model);

    expect(movePierreFileTreeFocus(regionId, true)).toBe("src/main.ts");

    expect(keydownHandler).toHaveBeenCalledTimes(1);
    expect(keydownHandler.mock.calls[0]?.[0].key).toBe("ArrowDown");

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("returns visible bucketed files across registered trees", () => {
    const stagedModel = createModel();
    const unstagedModel = createModel();
    const regionId = "changes-files-test-visible";

    registerPierreFileTreeNav(regionId, [{ bucket: "staged", path: "src/main.ts" }], stagedModel);
    registerPierreFileTreeNav(regionId, [{ bucket: "unstaged", path: "README.md" }], unstagedModel);

    expect(getPierreFileTreeVisibleBucketedFiles(regionId)).toEqual([
      { bucket: "staged", path: "src/main.ts" },
      { bucket: "unstaged", path: "README.md" },
    ]);

    unregisterPierreFileTreeNav(regionId, stagedModel);
    unregisterPierreFileTreeNav(regionId, unstagedModel);
  });

  it("returns real paths for visible bucketed files registered with synthetic tree paths", () => {
    const model = createModel({ "STAGED CHANGES": true });
    const regionId = "changes-files-test-synthetic-visible";

    registerPierreFileTreeNav(
      regionId,
      [
        {
          bucket: "staged",
          path: "STAGED CHANGES/src/main.ts",
          realPath: "src/main.ts",
        },
      ],
      model,
    );

    expect(getPierreFileTreeVisibleBucketedFiles(regionId)).toEqual([
      { bucket: "staged", path: "src/main.ts" },
    ]);

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("returns the focused bucketed file from the registered tree", () => {
    const stagedModel = {
      focusNearestPath: vi.fn(() => "staged.ts"),
      getFileTreeContainer: () => undefined,
      getFocusedPath: () => null,
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const unstagedModel = {
      focusNearestPath: vi.fn(() => "unstaged.ts"),
      getFileTreeContainer: () => undefined,
      getFocusedPath: () => "unstaged.ts",
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const regionId = "changes-files-test-focused-bucketed";

    registerPierreFileTreeNav(regionId, [{ bucket: "staged", path: "staged.ts" }], stagedModel);
    registerPierreFileTreeNav(
      regionId,
      [{ bucket: "unstaged", path: "unstaged.ts" }],
      unstagedModel,
    );

    expect(getPierreFileTreeFocusedBucketedFile(regionId)).toEqual({
      bucket: "unstaged",
      path: "unstaged.ts",
    });

    unregisterPierreFileTreeNav(regionId, stagedModel);
    unregisterPierreFileTreeNav(regionId, unstagedModel);
  });

  it("moves focus from one registered tree to the next at a boundary", () => {
    const focusedButton = document.createElement("button");
    focusedButton.dataset.type = "item";
    focusedButton.dataset.itemPath = "staged.ts";
    focusedButton.dataset.itemFocused = "true";
    const shadowRoot = document.createElement("div").attachShadow({ mode: "open" });
    shadowRoot.append(focusedButton);
    const host = shadowRoot.host as HTMLElement;
    const keydownHandler = vi.fn<(event: KeyboardEvent) => void>();
    focusedButton.addEventListener("keydown", keydownHandler);
    const stagedModel = {
      focusNearestPath: vi.fn(() => "staged.ts"),
      getFileTreeContainer: () => host,
      getFocusedPath: () => "staged.ts",
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const unstagedModel = {
      focusPath: vi.fn<(path: string) => void>(),
      focusNearestPath: vi.fn(() => "unstaged.ts"),
      getFileTreeContainer: () => undefined,
      getFocusedPath: () => null,
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const regionId = "changes-files-test-cross-tree";

    registerPierreFileTreeNav(regionId, [{ bucket: "staged", path: "staged.ts" }], stagedModel);
    registerPierreFileTreeNav(
      regionId,
      [{ bucket: "unstaged", path: "unstaged.ts" }],
      unstagedModel,
    );

    expect(movePierreFileTreeFocus(regionId, true)).toBe("unstaged.ts");
    expect(keydownHandler).toHaveBeenCalledTimes(1);
    expect(unstagedModel.focusPath).toHaveBeenCalledWith("unstaged.ts");

    unregisterPierreFileTreeNav(regionId, stagedModel);
    unregisterPierreFileTreeNav(regionId, unstagedModel);
  });

  it("returns a directory row path when focus moves to a directory", () => {
    let focusedPath = "STAGED CHANGES/src/main.ts";
    const focusedButton = document.createElement("button");
    focusedButton.dataset.type = "item";
    focusedButton.dataset.itemPath = "STAGED CHANGES/src/main.ts";
    focusedButton.dataset.itemFocused = "true";
    const shadowRoot = document.createElement("div").attachShadow({ mode: "open" });
    shadowRoot.append(focusedButton);
    const host = shadowRoot.host as HTMLElement;
    focusedButton.addEventListener("keydown", () => {
      focusedPath = "CHANGES";
    });
    const model = {
      focusNearestPath: vi.fn((path: string | null) => path ?? "STAGED CHANGES/src/main.ts"),
      getFileTreeContainer: () => host,
      getFocusedPath: () => focusedPath,
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const regionId = "changes-files-test-directory-row-move";

    registerPierreFileTreeNav(
      regionId,
      [
        { bucket: "staged", path: "STAGED CHANGES/src/main.ts", realPath: "src/main.ts" },
        { bucket: "unstaged", path: "CHANGES/api/file.ts", realPath: "api/file.ts" },
      ],
      model,
    );

    expect(movePierreFileTreeFocus(regionId, true)).toBe("CHANGES");
    expect(movePierreFileTreeFocusFile(regionId, true)).toBeNull();

    unregisterPierreFileTreeNav(regionId, model);
  });

  it("returns the last file when focus moves onto the last row", () => {
    let focusedPath = "index.html";
    const focusedButton = document.createElement("button");
    focusedButton.dataset.type = "item";
    focusedButton.dataset.itemPath = "index.html";
    focusedButton.dataset.itemFocused = "true";
    const shadowRoot = document.createElement("div").attachShadow({ mode: "open" });
    shadowRoot.append(focusedButton);
    const host = shadowRoot.host as HTMLElement;
    focusedButton.addEventListener("keydown", () => {
      focusedPath = "Trees, from Pierre.md";
    });
    const stagedModel = {
      focusNearestPath: vi.fn((path: string | null) => path ?? "index.html"),
      getFileTreeContainer: () => host,
      getFocusedPath: () => focusedPath,
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const unstagedModel = createModel();
    const regionId = "changes-files-test-last-row-move";

    registerPierreFileTreeNav(
      regionId,
      [
        { bucket: "staged", path: "index.html" },
        { bucket: "staged", path: "Trees, from Pierre.md" },
      ],
      stagedModel,
    );
    registerPierreFileTreeNav(
      regionId,
      [{ bucket: "unstaged", path: "first-unstaged.ts" }],
      unstagedModel,
    );

    expect(movePierreFileTreeFocusFile(regionId, true)).toEqual({
      bucket: "staged",
      path: "Trees, from Pierre.md",
    });

    unregisterPierreFileTreeNav(regionId, stagedModel);
    unregisterPierreFileTreeNav(regionId, unstagedModel);
  });

  it("returns the bucket from the selected tree when paths overlap", () => {
    const stagedModel = {
      focusNearestPath: vi.fn(() => "same.ts"),
      getFileTreeContainer: () => undefined,
      getFocusedPath: () => "same.ts",
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const unstagedModel = {
      focusNearestPath: vi.fn(() => "same.ts"),
      getFileTreeContainer: () => undefined,
      getFocusedPath: () => null,
      getItem: () => null,
    } as unknown as PierreFileTreeModel;
    const regionId = "changes-files-test-overlapping-paths";

    registerPierreFileTreeNav(regionId, [{ bucket: "staged", path: "same.ts" }], stagedModel);
    registerPierreFileTreeNav(regionId, [{ bucket: "unstaged", path: "same.ts" }], unstagedModel, {
      selectedPath: "same.ts",
    });

    expect(movePierreFileTreeFocusFile(regionId, true)).toEqual({
      bucket: "unstaged",
      path: "same.ts",
    });

    unregisterPierreFileTreeNav(regionId, stagedModel);
    unregisterPierreFileTreeNav(regionId, unstagedModel);
  });
});
