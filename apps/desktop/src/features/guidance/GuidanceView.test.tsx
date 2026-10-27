import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterAll, beforeAll, expect, it } from "vitest";
import { GuidanceView } from "./GuidanceView";
import { exampleGuidance } from "./GuidanceView.stories";
import { GuidanceExplanation } from "./GuidanceExplanation";

const originalResizeObserver = window.ResizeObserver;
beforeAll(() => {
  window.ResizeObserver = class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterAll(() => {
  window.ResizeObserver = originalResizeObserver;
});

function Example({
  stale = false,
  saveSucceeds = true,
}: {
  stale?: boolean;
  saveSucceeds?: boolean;
}) {
  const [guide, setGuide] = useState(exampleGuidance);
  return (
    <GuidanceView
      guide={guide}
      stale={stale}
      busy={false}
      error=""
      onSelectStep={(id) => setGuide((current) => ({ ...current, selectedStepId: id }))}
      onReviewed={(id) => setGuide((current) => ({ ...current, reviewedStepIds: [id] }))}
      onMessage={async () => saveSucceeds}
      renderDiff={(reference, step) => (
        <>
          <GuidanceExplanation title={step.title} body={reference.note ?? step.body} />
          <output aria-label="Highlighted reference">{`${reference.path}:${reference.startLine}-${reference.endLine}`}</output>
        </>
      )}
    />
  );
}

it("moves between saved steps and highlights the selected reference", () => {
  render(<Example />);
  expect(screen.getByRole("status", { name: "Highlighted reference" })).toHaveTextContent(
    "src/invoices/createInvoice.ts:18-22",
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark step reviewed" }));
  expect(screen.getByText(/1 of 3 reviewed/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(
    within(screen.getByRole("region", { name: "Step explanation" })).getByRole("heading", {
      name: "Verify the boundary cases",
    }),
  ).toBeVisible();
  expect(screen.getByRole("status", { name: "Highlighted reference" })).toHaveTextContent(
    "createInvoice.test.ts:32-39",
  );
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  expect(screen.getByRole("button", { name: "Reviewed — mark unreviewed" })).toBeVisible();
});

it("keeps a failed message draft available for retry", async () => {
  render(<Example saveSucceeds={false} />);
  fireEvent.click(screen.getByRole("tab", { name: /Messages/ }));
  const input = screen.getByRole("textbox", { name: "Ask or leave a note" });
  fireEvent.change(input, { target: { value: "Why is zero valid?" } });
  fireEvent.click(screen.getByRole("button", { name: "Save message for agent" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  expect(input).toHaveValue("Why is zero valid?");
});

it("clears a message draft only after it has been saved", async () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("tab", { name: /Messages/ }));
  const input = screen.getByRole("textbox", { name: "Ask or leave a note" });
  fireEvent.change(input, { target: { value: "Please explain this." } });
  fireEvent.click(screen.getByRole("button", { name: "Save message for agent" }));
  await waitFor(() => expect(input).toHaveValue(""));
});

it("keeps outdated guidance readable but prevents reviewing and displaying newer code as its references", () => {
  render(<Example stale />);
  expect(screen.getByRole("status")).toHaveTextContent("New commits");
  expect(screen.getByRole("button", { name: "Mark step reviewed" })).toBeDisabled();
  expect(screen.queryByRole("status", { name: "Highlighted reference" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /Messages/ }));
  expect(screen.getByRole("textbox", { name: "Ask or leave a note" })).toBeEnabled();
});
