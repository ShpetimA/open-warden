import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { expect, test } from "vitest";
import {
  getPierreFileAfterRemoval,
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "./pierreFileTreeNavigation";

test("mutation selection follows live prepared order and bucket identity, excluding collapsed files", () => {
  const files = [
    { path: "Changes/zeta/file.ts", realPath: "zeta/file.ts", bucket: "unstaged" as const },
    { path: "Changes/alpha/file.ts", realPath: "alpha/file.ts", bucket: "untracked" as const },
    { path: "Staged/alpha/file.ts", realPath: "alpha/file.ts", bucket: "staged" as const },
    { path: "Changes/middle/file.ts", realPath: "middle/file.ts", bucket: "unstaged" as const },
  ];
  const preparedInput = prepareFileTreeInput(files.map((file) => file.path));
  const model = new FileTree({
    preparedInput,
    initialExpansion: "open",
    flattenEmptyDirectories: false,
  });
  const region = "removal-behavior";
  try {
    registerPierreFileTreeNav(region, files, model, { preparedInput });
    const active = { bucket: "untracked" as const, path: "alpha/file.ts" };
    expect(getPierreFileAfterRemoval(region, active, [active])).toEqual({
      bucket: "unstaged",
      path: "middle/file.ts",
    });
    const middle = model.getItem("Changes/middle");
    if (middle && "collapse" in middle) middle.collapse();
    expect(getPierreFileAfterRemoval(region, active, [active])).toEqual({
      bucket: "unstaged",
      path: "zeta/file.ts",
    });
    const staged = { bucket: "staged" as const, path: "alpha/file.ts" };
    expect(getPierreFileAfterRemoval(region, staged, [staged])).toBeNull();
    expect(getPierreFileAfterRemoval(region, active, [staged])).toBeNull();
  } finally {
    unregisterPierreFileTreeNav(region, model);
    model.cleanUp();
  }
});
