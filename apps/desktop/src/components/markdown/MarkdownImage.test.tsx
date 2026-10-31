import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { Markdown } from "@/components/markdown/Markdown";

const body = [
  "![Before](https://example.com/before.png)",
  "",
  "![After](https://example.com/after.png)",
  "",
  "![Detail](https://example.com/detail.png)",
].join("\n");

it("steps through the document's images from the opened one", async () => {
  render(<Markdown>{body}</Markdown>);

  fireEvent.click(await screen.findByRole("img", { name: "After" }));
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("2 / 3");

  fireEvent.click(screen.getByRole("button", { name: "Next image" }));
  expect(dialog).toHaveTextContent("3 / 3");
  expect(dialog.querySelector("img")).toHaveAttribute("alt", "Detail");

  fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" });
  expect(dialog).toHaveTextContent("1 / 3");

  fireEvent.click(screen.getByRole("button", { name: "Previous image" }));
  expect(dialog).toHaveTextContent("3 / 3");
});

it("shows no arrows for a single image", async () => {
  render(<Markdown>{"![Only](https://example.com/only.png)"}</Markdown>);

  fireEvent.click(await screen.findByRole("img", { name: "Only" }));
  await screen.findByRole("dialog");
  expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
});
