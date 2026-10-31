import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { desktopFailure } from "@/platform/desktop/failure";
import { ImagePreview } from "./ImagePreview";

test("image controls switch to actual size and expose decode failures through their owner", () => {
  let failures = 0;
  render(
    <ImagePreview
      name="image.png"
      label="After"
      state={{
        status: "ready",
        data: {
          width: 640,
          height: 320,
          url: "data:image/png;base64,AAAA",
        },
      }}
      onRetry={() => {}}
      onDecodeError={() => {
        failures += 1;
      }}
    />,
  );

  expect(screen.getByText("640 × 320")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Actual size", exact: true }));
  expect(screen.getByRole("button", { name: "Actual size", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("img")).toHaveStyle({ width: "640px", maxWidth: "none" });
  fireEvent.error(screen.getByRole("img"));
  expect(failures).toBe(1);
});

test("failed image reads retain a readable retry action", () => {
  let retries = 0;
  render(
    <ImagePreview
      name="image.png"
      label="Before"
      state={{
        status: "failed",
        error: desktopFailure("getImagePreview", "unavailable", "The image could not be read."),
      }}
      onRetry={() => {
        retries += 1;
      }}
      onDecodeError={() => {}}
    />,
  );

  expect(screen.getByText("The image could not be read.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry", exact: true }));
  expect(retries).toBe(1);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
