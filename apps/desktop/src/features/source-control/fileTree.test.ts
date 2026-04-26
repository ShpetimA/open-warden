import { describe, expect, it } from "vitest";

import { buildSourceControlFileTree, collectDirectoryPaths } from "./fileTree";

describe("buildSourceControlFileTree", () => {
  it("groups files into sorted directories and files", () => {
    const tree = buildSourceControlFileTree([
      { path: "src/zeta.ts" },
      { path: "README.md" },
      { path: "src/components/Button.tsx" },
      { path: "src/components/Input.tsx" },
      { path: "src/app.tsx" },
    ]);

    expect(tree).toMatchObject([
      {
        kind: "directory",
        name: "src",
        path: "src",
        fileCount: 4,
        children: [
          {
            kind: "directory",
            name: "components",
            path: "src/components",
            fileCount: 2,
          },
          {
            kind: "file",
            name: "app.tsx",
            path: "src/app.tsx",
          },
          {
            kind: "file",
            name: "zeta.ts",
            path: "src/zeta.ts",
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
      },
    ]);
  });

  it("compacts single-child directory chains", () => {
    const tree = buildSourceControlFileTree([
      { path: "apps/desktop/src/App.tsx" },
      { path: "apps/desktop/src/main.tsx" },
    ]);

    expect(tree).toMatchObject([
      {
        kind: "directory",
        name: "apps/desktop/src",
        path: "apps/desktop/src",
        fileCount: 2,
        children: [
          { kind: "file", name: "App.tsx", path: "apps/desktop/src/App.tsx" },
          { kind: "file", name: "main.tsx", path: "apps/desktop/src/main.tsx" },
        ],
      },
    ]);
  });

  it("can keep single-child directory chains unflattened", () => {
    const tree = buildSourceControlFileTree(
      [
        { path: "Staged Changes/apps/desktop/src/App.tsx" },
        { path: "Staged Changes/apps/desktop/src/main.tsx" },
      ],
      { flattenEmptyDirectories: false },
    );

    expect(tree).toMatchObject([
      {
        kind: "directory",
        name: "Staged Changes",
        path: "Staged Changes",
        children: [
          {
            kind: "directory",
            name: "apps",
            path: "Staged Changes/apps",
          },
        ],
      },
    ]);
  });

  it("normalizes windows-style paths when building directories", () => {
    const tree = buildSourceControlFileTree([{ path: "src\\nested\\file.ts" }]);

    expect(tree).toMatchObject([
      {
        kind: "directory",
        name: "src/nested",
        path: "src/nested",
        fileCount: 1,
        children: [{ kind: "file", name: "file.ts", path: "src/nested/file.ts" }],
      },
    ]);
  });
});

describe("collectDirectoryPaths", () => {
  it("collects every directory path in the tree", () => {
    const tree = buildSourceControlFileTree([
      { path: "src/features/a.ts" },
      { path: "src/features/b.ts" },
      { path: "src/lib/c.ts" },
    ]);

    expect(collectDirectoryPaths(tree)).toEqual(["src", "src/features", "src/lib"]);
  });
});
