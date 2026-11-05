import { act, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { Markdown } from "./Markdown";

it("preserves code symbols while sanitizing parsed HTML", async () => {
  await act(async () => {
    render(
      <Markdown>
        {[
          "```text",
          "Driver->>Fetch: <request> & response",
          "```",
          '<script>alert("unsafe")</script>',
          '<a href="javascript:alert(1)">Unsafe link</a>',
          '<img src="https://example.com/icon.svg" height="16" onerror="alert(1)">',
        ].join("\n")}
      </Markdown>,
    );
  });

  const container = document.body;

  expect(await screen.findByText("Driver->>Fetch: <request> & response")).toBeVisible();
  expect(container.querySelector("script")).toBeNull();
  expect(screen.getByText("Unsafe link")).not.toHaveAttribute("href");
  expect(container.querySelector("img")).not.toHaveAttribute("onerror");
});

it("preserves picture sources and inline image dimensions inside disclosures", async () => {
  const { container } = render(
    <Markdown>
      {[
        "<details><summary><strong><picture>",
        '<source media="(prefers-color-scheme: dark)" srcset="https://example.com/dark.svg">',
        '<img src="https://example.com/light.svg" width="16" height="16" alt="">',
        "</picture> Recent review info</strong></summary>",
        "Review details</details>",
      ].join("")}
    </Markdown>,
  );

  expect(await screen.findByText("Recent review info")).toBeVisible();
  expect(container.querySelector("picture > img")).toHaveAttribute("height", "16");
  expect(container.querySelector("source")).toHaveAttribute(
    "media",
    "(prefers-color-scheme: dark)",
  );
  expect(container.querySelector('[data-slot="markdown-image-frame"]')).toBeNull();
});

it("keeps mounted code blocks resolved after the shared highlight cache evicts older entries", async () => {
  const blocks = Array.from(
    { length: 130 },
    (_, index) => `\`\`\`text\nCache block ${index}\n\`\`\``,
  );

  render(<Markdown>{blocks.join("\n\n")}</Markdown>);

  expect(await screen.findByText("Cache block 0")).toBeVisible();
  expect(await screen.findByText("Cache block 129")).toBeVisible();
});

it("highlights the new contents when an existing code block changes", async () => {
  const { rerender } = render(<Markdown>{"```text\nOriginal code block\n```"}</Markdown>);

  expect(await screen.findByText("Original code block")).toBeVisible();
  rerender(<Markdown>{"```text\nUpdated code block\n```"}</Markdown>);

  expect(await screen.findByText("Updated code block")).toBeVisible();
  expect(screen.queryByText("Original code block")).toBeNull();
});
