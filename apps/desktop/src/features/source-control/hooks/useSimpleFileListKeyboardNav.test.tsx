import { FileTree, prepareFileTreeInput } from "@pierre/trees";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Provider } from "react-redux";
import { expect, it } from "vitest";
import { rootReducer } from "@/app/store";
import {
  buildReviewDisplayFiles,
  compareReviewFileEntries,
} from "../components/reviewFileGrouping";
import {
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "../pierreFileTreeNavigation";
import { useSimpleFileListKeyboardNav } from "./useSimpleFileListKeyboardNav";

function FilePreview() {
  const [path, setPath] = useState("");
  useSimpleFileListKeyboardNav({
    regionId: "preview-test",
    onSelectPath: setPath,
    includeSymbolPeek: false,
  });
  return (
    <>
      <input aria-label="Filter" />
      <output>{path}</output>
    </>
  );
}

it.each(["j", "k"])("opens the focused file with %s in tree mode without Enter", (key) => {
  const store = configureStore({ reducer: rootReducer });
  expect(store.getState().settings.appSettings.sourceControl.fileTreeRenderMode).toBe("tree");
  const model = new FileTree({ paths: ["README.md"] });
  registerPierreFileTreeNav("preview-test", [{ path: "README.md" }], model, {
    preparedInput: prepareFileTreeInput(["README.md"]),
  });
  try {
    render(
      <Provider store={store}>
        <FilePreview />
      </Provider>,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key, code: `Key${key.toUpperCase()}` });
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    fireEvent.keyDown(document, { key, code: `Key${key.toUpperCase()}` });
    expect(screen.getByRole("status")).toHaveTextContent("README.md");
  } finally {
    unregisterPierreFileTreeNav("preview-test", model);
    model.cleanUp();
  }
});

it("uses J/K to open original paths across review headings without stopping on folders", () => {
  const store = configureStore({ reducer: rootReducer });
  const files = buildReviewDisplayFiles([
    { path: "src/invoice.ts" },
    { path: "src/invoice.test.ts" },
    { path: "docs/invoice.md" },
  ]);
  const model = new FileTree({
    paths: files.map((file) => file.path),
    sort: compareReviewFileEntries,
    flattenEmptyDirectories: false,
    initialExpansion: "open",
  });
  registerPierreFileTreeNav("preview-test", files, model, {
    preparedInput: prepareFileTreeInput(
      files.map((file) => file.path),
      { sort: compareReviewFileEntries },
    ),
  });

  try {
    render(
      <Provider store={store}>
        <FilePreview />
      </Provider>,
    );
    fireEvent.keyDown(document, { key: "j", code: "KeyJ" });
    expect(screen.getByRole("status")).toHaveTextContent("src/invoice.ts");
    fireEvent.keyDown(document, { key: "j", code: "KeyJ" });
    expect(screen.getByRole("status")).toHaveTextContent("src/invoice.test.ts");
    fireEvent.keyDown(document, { key: "k", code: "KeyK" });
    expect(screen.getByRole("status")).toHaveTextContent("src/invoice.ts");
  } finally {
    unregisterPierreFileTreeNav("preview-test", model);
    model.cleanUp();
  }
});
