import type { FileTree as PeerFileTreeModel } from "@pierre/trees";
import { describe, expect, it, vi } from "vitest";

import {
  getPeerFileTreeVisiblePaths,
  movePeerFileTreeFocus,
  registerPeerFileTreeNav,
  scrollPeerFileTreePathIntoView,
  unregisterPeerFileTreeNav,
} from "./peerFileTreeNavigation";

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
  } as unknown as PeerFileTreeModel;
}

describe("peerFileTreeNavigation", () => {
  it("returns visible paths based on expanded directories", () => {
    const model = createModel({ src: true, "src/utils": true });
    const regionId = "repo-files-test-visible";

    registerPeerFileTreeNav(
      regionId,
      [{ path: "README.md" }, { path: "src/main.ts" }, { path: "src/utils/helper.ts" }],
      model,
    );

    expect(getPeerFileTreeVisiblePaths(regionId)).toEqual([
      "src/utils/helper.ts",
      "src/main.ts",
      "README.md",
    ]);

    unregisterPeerFileTreeNav(regionId, model);
  });

  it("hides descendants when a directory is collapsed", () => {
    const model = createModel({ src: false, "src/utils": true });
    const regionId = "repo-files-test-collapsed";

    registerPeerFileTreeNav(
      regionId,
      [{ path: "README.md" }, { path: "src/main.ts" }, { path: "src/utils/helper.ts" }],
      model,
    );

    expect(getPeerFileTreeVisiblePaths(regionId)).toEqual(["README.md"]);

    unregisterPeerFileTreeNav(regionId, model);
  });

  it("focuses the peer tree path when scrolling into view", () => {
    const model = createModel();
    const regionId = "repo-files-test-scroll";

    registerPeerFileTreeNav(regionId, [{ path: "src/main.ts" }], model);

    scrollPeerFileTreePathIntoView(regionId, "src/main.ts");

    expect(model.focusPath).toHaveBeenCalledWith("src/main.ts");

    unregisterPeerFileTreeNav(regionId, model);
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
    } as unknown as PeerFileTreeModel;
    const regionId = "repo-files-test-move-focus";

    registerPeerFileTreeNav(regionId, [{ path: "src/main.ts" }], model);

    expect(movePeerFileTreeFocus(regionId, true)).toBe("src/main.ts");

    expect(keydownHandler).toHaveBeenCalledTimes(1);
    expect(keydownHandler.mock.calls[0]?.[0].key).toBe("ArrowDown");

    unregisterPeerFileTreeNav(regionId, model);
  });
});
