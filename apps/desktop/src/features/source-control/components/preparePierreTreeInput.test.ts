import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { expect, it } from "vitest";

import { preparePierreTreeInput } from "./preparePierreTreeInput";
import { createPreparedTreeProjection } from "./pierreFileTreeProjection";

it("inserts the temporary row after its focused file without reordering the other paths", () => {
  const paths = [
    "README.md",
    "src/feature10.ts",
    "src/ui/Button.tsx",
    "src/feature2.ts",
    "src/main.ts",
    "src/.new-entry",
  ];
  const { preparedInput: input } = preparePierreTreeInput(
    paths,
    {},
    { path: "src/.new-entry", anchorPath: "src/main.ts" },
  );
  expect(input.paths).toEqual([
    "src/ui/Button.tsx",
    "src/feature2.ts",
    "src/feature10.ts",
    "src/main.ts",
    "src/.new-entry",
    "README.md",
  ]);
  expect(input.paths.filter((path) => path !== "src/.new-entry")).toEqual(
    prepareFileTreeInput(paths.filter((path) => path !== "src/.new-entry")).paths,
  );
});

it("places a folder's input before its existing children, including child directories", () => {
  const { preparedInput: input } = preparePierreTreeInput(
    ["src/ui/Button.tsx", "src/main.ts", "src/.new-entry"],
    {},
    { path: "src/.new-entry", anchorPath: "src/" },
  );
  const model = new FileTree({
    preparedInput: input,
    initialExpansion: "open",
    flattenEmptyDirectories: true,
  });
  try {
    expect(createPreparedTreeProjection(input.paths, model, true).getVisiblePaths()).toEqual([
      "src",
      "src/.new-entry",
      "src/ui",
      "src/ui/Button.tsx",
      "src/main.ts",
    ]);
  } finally {
    model.cleanUp();
  }
});

it("inserts after an explicit empty directory and before its siblings", () => {
  const { preparedInput: input } = preparePierreTreeInput(
    ["src/empty/", "src/main.ts", "src/empty/.new-entry"],
    {},
    { path: "src/empty/.new-entry", anchorPath: "src/empty/" },
  );
  expect(input.paths).toEqual(["src/empty/", "src/empty/.new-entry", "src/main.ts"]);
});

it("returns to the native sort order when creation ends", () => {
  const paths = ["src/main.ts", "src/a-new-file.ts", "src/z-last.ts"];
  expect(preparePierreTreeInput(paths, {}).preparedInput.paths).toEqual(
    prepareFileTreeInput(paths).paths,
  );
});

it("keeps the controller's reset validation and explicit nested folders consistent with placement", () => {
  const paths = ["src/empty/nested/", "src/main.ts", "README.md"];
  const initial = preparePierreTreeInput(paths, {});
  let currentSort = initial.sort;
  const model = new FileTree({
    preparedInput: initial.preparedInput,
    sort: (left, right) => currentSort(left, right),
    initialExpansion: "open",
  });
  try {
    const nextPaths = [...paths, "src/empty/nested/.new-entry"];
    const next = preparePierreTreeInput(
      nextPaths,
      {},
      { path: "src/empty/nested/.new-entry", anchorPath: "src/empty/nested/" },
    );
    currentSort = next.sort;
    model.resetPaths(nextPaths, { preparedInput: next.preparedInput });
    expect(model.getItem("src/empty/nested/.new-entry")).not.toBeNull();
    expect(model.getItem("src/empty/nested/nested/")).toBeNull();
    currentSort = initial.sort;
    model.resetPaths(paths, { preparedInput: initial.preparedInput });
    expect(model.getItem("src/empty/nested/.new-entry")).toBeNull();
  } finally {
    model.cleanUp();
  }
});
