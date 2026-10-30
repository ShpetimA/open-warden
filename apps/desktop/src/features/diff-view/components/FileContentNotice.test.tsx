import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { FileContentNotice } from "./FileContentNotice";

test("shows both rename paths and byte sizes without text editing controls", () => {
  const before = { kind: "binary" as const, name: "assets/before.png", byteLength: 128 };
  const after = { ...before, name: "assets/after.png", byteLength: 256 };

  render(
    <FileContentNotice
      activePath={after.name}
      metadata={after}
      oldFile={before}
      newFile={after}
      mode="comparison"
    />,
  );

  expect(screen.getByRole("heading", { name: "Binary file", exact: true })).toBeVisible();
  expect(screen.getByText(before.name, { exact: true })).toBeVisible();
  expect(screen.getByText("128 bytes", { exact: true })).toBeVisible();
  expect(screen.getByText("256 bytes", { exact: true })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("keeps a missing side distinct from an empty file and identifies the size limit", () => {
  const metadata = { kind: "too-large" as const, name: "archive.zip", byteLength: 52_428_800 };

  render(
    <FileContentNotice
      activePath={metadata.name}
      metadata={metadata}
      oldFile={null}
      newFile={metadata}
      mode="comparison"
    />,
  );

  expect(
    screen.getByRole("heading", { name: "File exceeds the preview limit", exact: true }),
  ).toBeVisible();
  expect(screen.getByText("Not present", { exact: true })).toBeVisible();
  expect(screen.queryByText("Binary file", { exact: true })).not.toBeInTheDocument();
});
