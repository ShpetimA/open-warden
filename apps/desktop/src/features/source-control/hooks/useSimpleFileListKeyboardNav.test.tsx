import { FileTree } from "@pierre/trees";
import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Provider } from "react-redux";
import { expect, it } from "vitest";
import { rootReducer } from "@/app/store";
import {
  registerPierreFileTreeNav,
  unregisterPierreFileTreeNav,
} from "../pierreFileTreeNavigation";
import { useSimpleFileListKeyboardNav } from "./useSimpleFileListKeyboardNav";

function FilePreview() {
  const [path, setPath] = useState("");
  useSimpleFileListKeyboardNav({
    regionId: "preview-test",
    getAllFilePaths: () => ["README.md"],
    getActivePath: () => path,
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
  registerPierreFileTreeNav("preview-test", [{ path: "README.md" }], model);
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
