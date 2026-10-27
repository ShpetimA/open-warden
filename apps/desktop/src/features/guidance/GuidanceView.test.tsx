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
      onClearMessages={async () => {
        setGuide((current) => ({ ...current, messages: [], acknowledgedMessageIds: [] }));
        return true;
      }}
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
  const steps = within(screen.getByRole("navigation", { name: "Walkthrough steps" }));
  expect(screen.getByRole("region", { name: "Files for this step" })).toBeVisible();
  expect(screen.queryByRole("tab", { name: "Files" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  fireEvent.click(steps.getByRole("button", { name: /Verify the boundary cases/ }));
  expect(
    within(screen.getByRole("region", { name: "Step explanation" })).getByRole("heading", {
      name: "Verify the boundary cases",
    }),
  ).toBeVisible();
  expect(screen.getByRole("status", { name: "Highlighted reference" })).toHaveTextContent(
    "createInvoice.test.ts:32-39",
  );
  fireEvent.click(steps.getByRole("button", { name: /Reject invalid amounts/ }));
  expect(screen.getByRole("button", { name: "Reviewed — mark unreviewed" })).toBeVisible();
});

it("keeps a failed message draft available for retry", async () => {
  render(<Example saveSucceeds={false} />);
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  expect(screen.getByRole("region", { name: "Files for this step" })).toBeVisible();
  const input = screen.getByRole("textbox", { name: "Ask about this step" });
  fireEvent.change(input, { target: { value: "Why is zero valid?" } });
  fireEvent.click(screen.getByRole("button", { name: "Save message" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
  expect(input).toHaveValue("Why is zero valid?");
});

it("clears a message draft only after it has been saved", async () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  const input = screen.getByRole("textbox", { name: "Ask about this step" });
  fireEvent.change(input, { target: { value: "Please explain this." } });
  fireEvent.click(screen.getByRole("button", { name: "Save message" }));
  await waitFor(() => expect(input).toHaveValue(""));
});

it("preserves a message draft when the floating composer is closed and reopened", () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Ask about this step" }), {
    target: { value: "Keep this draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Close guidance conversation" }));
  expect(screen.queryByRole("textbox", { name: "Ask about this step" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  expect(screen.getByRole("textbox", { name: "Ask about this step" })).toHaveValue(
    "Keep this draft",
  );
});

it("keeps outdated guidance readable but prevents reviewing and displaying newer code as its references", () => {
  render(<Example stale />);
  expect(screen.getByRole("status")).toHaveTextContent("New commits");
  expect(screen.getByRole("button", { name: "Mark step reviewed" })).toBeDisabled();
  expect(screen.queryByRole("status", { name: "Highlighted reference" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  expect(screen.getByRole("textbox", { name: "Ask about this step" })).toBeEnabled();
});

it("clears the saved conversation without removing walkthrough steps", async () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("button", { name: "Ask guidance agent" }));
  expect(
    screen.getByText("Should this also reject amounts with more than two decimal places?"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear guidance conversation" }));
  await waitFor(() =>
    expect(
      screen.queryByText("Should this also reject amounts with more than two decimal places?"),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("navigation", { name: "Walkthrough steps" })).toBeVisible();
});
