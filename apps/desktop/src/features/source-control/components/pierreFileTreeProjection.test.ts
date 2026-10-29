import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { expect, it } from "vitest";
import { createPreparedTreeProjection } from "./pierreFileTreeProjection";

it("resolves each directory once and checks expansion once per visible directory for deep comparisons", () => {
  const paths = Array.from(
    { length: 6000 },
    (_, index) =>
      `Changes/apps/mobile/e2e_maestro/integration/feature-${Math.floor(index / 100)}/permissions/file-${index}.yaml`,
  );
  const preparedInput = prepareFileTreeInput(paths);
  const model = new FileTree({
    preparedInput,
    initialExpansion: "open",
    flattenEmptyDirectories: false,
  });
  const lookups: string[] = [];
  const expansionChecks: string[] = [];
  const directoryPaths = new Set(
    paths.flatMap((path) => {
      const segments = path.split("/");
      return segments.slice(1).map((_, index) => segments.slice(0, index + 1).join("/"));
    }),
  );
  const projection = createPreparedTreeProjection(preparedInput.paths, {
    getItem(path) {
      lookups.push(path);
      const item = model.getItem(path);
      if (!item || !item.isDirectory()) return item;
      return {
        ...item,
        isExpanded() {
          expansionChecks.push(path);
          return item.isExpanded();
        },
      };
    },
  });
  try {
    expect(lookups).toHaveLength(directoryPaths.size);
    for (let index = 0; index < 20; index += 1) {
      expansionChecks.length = 0;
      const visible = projection.getVisiblePaths();
      expect(visible.filter((path) => path.endsWith(".yaml"))).toHaveLength(6000);
      expect(expansionChecks).toHaveLength(directoryPaths.size);
      expect(new Set(expansionChecks).size).toBe(expansionChecks.length);
    }
    expect(lookups).toHaveLength(directoryPaths.size);

    const integration = model.getItem("Changes/apps/mobile/e2e_maestro/integration");
    if (!integration?.isDirectory()) throw new Error("Missing integration directory");
    integration.collapse();
    expansionChecks.length = 0;
    expect(projection.getVisiblePaths()).not.toContain(paths[0]);
    expect(expansionChecks).toHaveLength(5);
    integration.expand();
    expect(projection.getVisiblePaths()).toContain(paths[0]);
    expect(lookups).toHaveLength(directoryPaths.size);
  } finally {
    model.cleanUp();
  }
});

it("keeps prepared file order and treats a flattened chain as one live expansion boundary", () => {
  const paths = ["last/deep/file.ts", "first/deep/file.ts"];
  const preparedInput = prepareFileTreeInput(paths, { flattenEmptyDirectories: true });
  const model = new FileTree({
    preparedInput,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
  });
  try {
    const projection = createPreparedTreeProjection(preparedInput.paths, model, true);
    expect(projection.getVisiblePaths()).toEqual([
      "first/deep",
      "first/deep/file.ts",
      "last/deep",
      "last/deep/file.ts",
    ]);
    const first = model.getItem("first/deep");
    if (first?.isDirectory()) first.collapse();
    expect(projection.getVisiblePaths()).toEqual(["first/deep", "last/deep", "last/deep/file.ts"]);
  } finally {
    model.cleanUp();
  }
});
