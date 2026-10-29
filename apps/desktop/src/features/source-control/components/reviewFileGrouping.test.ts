import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { describe, expect, it } from "vitest";

import {
  getPierreFileTreeVisibleSelectedFiles,
  getPierreFileTreeVisibleFiles,
  getNextUnviewedPierreFile,
  movePierreFileTreeFocusByFile,
  movePierreFileTreeFileForKey,
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "../pierreFileTreeNavigation";
import {
  buildReviewDisplayFiles,
  compareReviewFileEntries,
  getReviewFileGroup,
} from "./reviewFileGrouping";

import { buildDisplayFiles, compareFlatPierreEntries } from "./flatPierreTree";

describe("review file groups", () => {
  it.each([
    ["apps/hermes_gateway/src/hermes_gateway.erl", "Changes"],
    ["src/testing.ts", "Changes"],
    ["src/contest.cs", "Changes"],
    ["src/latest.cs", "Changes"],
    ["src/dist.ts", "Changes"],
    ["apps/hermes_gateway/test/hermes_gateway_test.erl", "Tests"],
    ["src/hermes_inbox_test.erl", "Tests"],
    ["src/amounts_test.go", "Tests"],
    ["src/invoice.spec.tsx", "Tests"],
    ["src/invoice.test.ts", "Tests"],
    ["src/__tests__/invoice.ts", "Tests"],
    ["test_invoice.py", "Tests"],
    ["InvoiceService.Tests/InvoiceTests.cs", "Tests"],
    ["InvoiceService.Tests/Helpers/Factory.cs", "Tests"],
    ["src/InvoiceTest.java", "Tests"],
    ["src/InvoiceTest.kt", "Tests"],
    ["src/InvoiceTests.swift", "Tests"],
    ["docs/hermes_inbox.md", "Docs"],
    ["apps/rest_server/priv/api-docs/openapi.json", "Docs"],
    ["README.md", "Docs"],
    ["CONTRIBUTING", "Docs"],
    ["guide.mdx", "Docs"],
    ["docs\\guide.rst", "Docs"],
    ["pnpm-lock.yaml", "Generated"],
    ["Cargo.lock", "Generated"],
    ["src/invoice.test.ts.snap", "Generated"],
    ["src/__snapshots__/invoice.snap", "Generated"],
    ["src/client.generated.ts", "Generated"],
    ["src/Invoice.g.cs", "Generated"],
    ["dist/bundle.js", "Generated"],
    ["vendor/test/something.js", "Generated"],
  ])("classifies %s as %s", (path, expected) => {
    expect(getReviewFileGroup(path)).toBe(expected);
  });

  it("orders review passes and keeps every original file object and path", () => {
    const files = [
      { path: "pnpm-lock.yaml", comments: 0 },
      { path: "docs/guide.md", comments: 1 },
      { path: "src/invoice.test.ts", comments: 2 },
      { path: "src/invoice.ts", comments: 3 },
    ];
    const displayFiles = buildReviewDisplayFiles(files);
    const prepared = prepareFileTreeInput(
      displayFiles.map((file) => file.path),
      { sort: compareReviewFileEntries },
    );
    expect(prepared.paths.map((path) => path.split("/")[0])).toEqual([
      "Changes",
      "Tests",
      "Docs",
      "Generated",
    ]);
    expect(displayFiles.map((file) => file.realPath)).toEqual(files.map((file) => file.path));
    for (const [index, file] of displayFiles.entries()) expect(file.source).toBe(files[index]);
    expect(new Set(displayFiles.map((file) => file.path)).size).toBe(files.length);
  });

  it("uses original paths for review navigation and respects collapsed categories", () => {
    const files = buildReviewDisplayFiles([
      { path: "docs/readme.md" },
      { path: "src/invoice.test.ts" },
      { path: "src/invoice.ts" },
    ]).map((file) => ({
      path: file.path,
      realPath: file.realPath,
      source: file.source,
      bucket: "unstaged" as const,
    }));
    const model = new FileTree({
      paths: files.map((file) => file.path),
      sort: compareReviewFileEntries,
      flattenEmptyDirectories: false,
      initialExpansion: "open",
    });
    const region = "review-group-navigation";
    registerPierreFileTreeNav(region, files, model, {
      preparedInput: prepareFileTreeInput(
        files.map((file) => file.path),
        { sort: compareReviewFileEntries },
      ),
    });
    try {
      expect(getPierreFileTreeVisibleSelectedFiles(region).map((file) => file.path)).toEqual([
        "src/invoice.ts",
        "src/invoice.test.ts",
        "docs/readme.md",
      ]);
      const testsGroup = model.getItem("Tests");
      if (testsGroup?.isDirectory()) testsGroup.collapse();
      expect(getPierreFileTreeVisibleSelectedFiles(region).map((file) => file.path)).toEqual([
        "src/invoice.ts",
        "docs/readme.md",
      ]);
    } finally {
      unregisterPierreFileTreeNav(region, model);
      model.cleanUp();
    }
  });

  it("moves between files across group headings and skips collapsed groups", () => {
    const files = buildReviewDisplayFiles([
      { path: "src/first.ts" },
      { path: "src/last.ts" },
      { path: "src/invoice.test.ts" },
      { path: "docs/guide.md" },
      { path: "pnpm-lock.yaml" },
    ]);
    const model = new FileTree({
      paths: files.map((file) => file.path),
      sort: compareReviewFileEntries,
      flattenEmptyDirectories: false,
      initialExpansion: "open",
    });
    const region = "review-group-file-navigation";
    registerPierreFileTreeNav(region, files, model, {
      preparedInput: prepareFileTreeInput(
        files.map((file) => file.path),
        { sort: compareReviewFileEntries },
      ),
    });

    try {
      model.focusPath("Changes/src/last.ts");
      expect(movePierreFileTreeFocusByFile(region, true)?.realPath).toBe("src/invoice.test.ts");
      expect(model.getFocusedPath()).toBe("Tests/src/invoice.test.ts");
      expect(movePierreFileTreeFocusByFile(region, false)?.realPath).toBe("src/last.ts");

      const testsGroup = model.getItem("Tests");
      if (testsGroup?.isDirectory()) testsGroup.collapse();
      expect(movePierreFileTreeFocusByFile(region, true)?.realPath).toBe("docs/guide.md");
      expect(movePierreFileTreeFocusByFile(region, false)?.realPath).toBe("src/last.ts");

      model.focusPath("Docs");
      expect(movePierreFileTreeFocusByFile(region, true)?.realPath).toBe("docs/guide.md");
      model.focusPath("Docs");
      expect(movePierreFileTreeFocusByFile(region, false)?.realPath).toBe("src/last.ts");

      model.focusPath("Changes/src/first.ts");
      expect(movePierreFileTreeFocusByFile(region, false)?.realPath).toBe("src/first.ts");
      model.focusPath("Generated/pnpm-lock.yaml");
      expect(movePierreFileTreeFocusByFile(region, true)?.realPath).toBe("pnpm-lock.yaml");
    } finally {
      unregisterPierreFileTreeNav(region, model);
      model.cleanUp();
    }
  });

  it("keeps files in the same folder addressable when filenames interleave across folders", () => {
    const files = buildReviewDisplayFiles([
      { path: "src/alpha/a.ts" },
      { path: "src/beta/b.ts" },
      { path: "src/alpha/c.ts" },
      { path: "src/Alpha/b.ts" },
      { path: "src/Alpha/d.ts" },
      { path: "app.json" },
      { path: "android/app/build.gradle" },
      { path: "android/build.gradle" },
    ]);
    const model = new FileTree({
      preparedInput: prepareFileTreeInput(
        files.map((file) => file.path),
        { sort: compareReviewFileEntries },
      ),
      sort: compareReviewFileEntries,
      flattenEmptyDirectories: false,
      initialExpansion: "open",
    });
    try {
      for (const file of files) {
        const item = model.getItem(file.path);
        expect(item?.getPath()).toBe(file.path);
        model.focusPath(file.path);
        expect(model.getFocusedPath()).toBe(file.path);
        item?.select();
        expect(item?.isSelected()).toBe(true);
        item?.deselect();
      }
    } finally {
      model.cleanUp();
    }
  });
});

it.each(["review", "tree", "list"] as const)(
  "shares %s render order between J/K and next unviewed",
  (mode) => {
    const sources = [
      "pnpm-lock.yaml",
      "src/z.ts",
      "docs/guide.md",
      "src/a.test.ts",
      "src/a.ts",
    ].map((path) => ({ path }));
    const files =
      mode === "review"
        ? buildReviewDisplayFiles(sources)
        : buildDisplayFiles(mode, sources, {
            sort: (left, right) =>
              left.path.localeCompare(right.path, undefined, {
                numeric: true,
                sensitivity: "base",
              }),
          });
    const sort =
      mode === "review"
        ? compareReviewFileEntries
        : mode === "list"
          ? compareFlatPierreEntries
          : "default";
    const preparedInput = prepareFileTreeInput(
      files.map((file) => file.path),
      { sort, flattenEmptyDirectories: mode === "tree" },
    );
    const model = new FileTree({
      preparedInput,
      sort,
      initialExpansion: "open",
      flattenEmptyDirectories: mode === "tree",
    });
    const region = `shared-${mode}`;
    registerPierreFileTreeNav(region, files, model, { preparedInput });
    try {
      const expected =
        mode === "review"
          ? ["src/a.ts", "src/z.ts", "src/a.test.ts", "docs/guide.md", "pnpm-lock.yaml"]
          : mode === "tree"
            ? ["docs/guide.md", "src/a.test.ts", "src/a.ts", "src/z.ts", "pnpm-lock.yaml"]
            : ["docs/guide.md", "pnpm-lock.yaml", "src/a.test.ts", "src/a.ts", "src/z.ts"];
      expect(getPierreFileTreeVisibleFiles(region).map((file) => file.realPath)).toEqual(expected);
      for (let index = 0; index < expected.length - 1; index += 1) {
        const file = files.find((file) => file.realPath === expected[index])!;
        model.focusPath(file.path);
        expect(movePierreFileTreeFocusByFile(region, true)?.realPath).toBe(expected[index + 1]);
        expect(getNextUnviewedPierreFile(region, expected[index]!, new Set())?.realPath).toBe(
          expected[index + 1],
        );
      }
      expect(getNextUnviewedPierreFile(region, expected.at(-1)!, new Set())?.realPath).toBe(
        expected[0],
      );
      expect(getNextUnviewedPierreFile(region, expected[0]!, new Set(expected))).toBeNull();
      expect(
        getNextUnviewedPierreFile(region, expected[0]!, new Set([expected[1]!]))?.realPath,
      ).toBe(expected[2]);
      if (mode === "review") {
        const tests = model.getItem("Tests");
        if (tests?.isDirectory()) tests.collapse();
        expect(getNextUnviewedPierreFile(region, "src/z.ts", new Set())?.realPath).toBe(
          "docs/guide.md",
        );
        expect(getNextUnviewedPierreFile(region, "src/a.test.ts", new Set())?.realPath).toBe(
          "docs/guide.md",
        );
      }
    } finally {
      unregisterPierreFileTreeNav(region, model);
      model.cleanUp();
    }
  },
);

it("uses actual flattened folder anchors and the same J/K policy for every screen", () => {
  const files = [{ path: "first/one/file.ts" }, { path: "last/two/file.ts" }];
  const preparedInput = prepareFileTreeInput(
    files.map((file) => file.path),
    { flattenEmptyDirectories: true },
  );
  const model = new FileTree({
    preparedInput,
    flattenEmptyDirectories: true,
    initialExpansion: "open",
  });
  const region = "flattened-navigation";
  registerPierreFileTreeNav(region, files, model, { preparedInput, flattenEmptyDirectories: true });
  try {
    model.focusPath("last/two");
    expect(movePierreFileTreeFileForKey(region, "j", true)?.path).toBe("last/two/file.ts");
    expect(movePierreFileTreeFileForKey(region, "k", false)?.path).toBe("first/one/file.ts");
    const folder = model.getItem("first/one");
    if (folder?.isDirectory()) folder.collapse();
    expect(getPierreFileTreeVisibleFiles(region).map((file) => file.path)).toEqual([
      "last/two/file.ts",
    ]);
  } finally {
    unregisterPierreFileTreeNav(region, model);
    model.cleanUp();
  }
});

it("preserves explicit folders when projecting the flat file list", () => {
  const [folder] = buildDisplayFiles("list", [{ path: "src/empty/" }]);
  expect(folder?.realPath).toBe("src/empty/");
  expect(folder?.path.endsWith("/")).toBe(true);
});
