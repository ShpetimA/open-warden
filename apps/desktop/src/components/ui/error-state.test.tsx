import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";

import { desktopFailure } from "@/platform/desktop/failure";
import { ActionError, ErrorNotice, ErrorState } from "./error-state";

afterEach(() => vi.useRealTimers());

test("retries in place, keeps the recovery control mounted, and clears on success", () => {
  function Example() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(true);
    return (
      <>
        {error ? (
          <ErrorState
            title="Couldn’t load commits"
            error={desktopFailure(
              "getCommitHistory",
              "network",
              "The remote service couldn’t be reached.",
            )}
            busy={busy}
            recovery={{ label: "Retry", onAction: () => setBusy(true) }}
          />
        ) : (
          <p>Commits loaded</p>
        )}
        <button onClick={() => setError(false)}>Complete request</button>
      </>
    );
  }
  render(<Example />);
  const retry = screen.getByRole("button", { name: "Retry" });
  fireEvent.click(retry);
  expect(retry).toBeInTheDocument();
  expect(retry).toBeDisabled();
  expect(retry).toHaveTextContent("Trying again");
  fireEvent.click(screen.getByRole("button", { name: "Complete request" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByText("Commits loaded")).toBeVisible();
});

test("keeps stale content visible and hides raw unknown errors", () => {
  render(
    <>
      <ErrorNotice
        title="Couldn’t refresh"
        error={new Error("Error invoking secret remote method")}
      />
      <p>Existing commits</p>
    </>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("The operation couldn’t be completed");
  expect(screen.queryByText(/secret remote/)).not.toBeInTheDocument();
  expect(screen.getByText("Existing commits")).toBeVisible();
});

test("keeps a form draft beside its submission failure", () => {
  render(
    <>
      <textarea aria-label="Review note" defaultValue="Keep my draft" />
      <ActionError
        title="Review could not be submitted"
        error={desktopFailure(
          "submitPullRequestReview",
          "permission",
          "Your account doesn’t have permission for this operation.",
        )}
      />
    </>,
  );
  expect(screen.getByRole("textbox", { name: "Review note" })).toHaveValue("Keep my draft");
  expect(screen.getByRole("alert")).toHaveTextContent("doesn’t have permission");
});

test("honors retry timing and keeps cancellations quiet", () => {
  vi.useFakeTimers();
  const retryAt = Date.now() + 1000;
  const { rerender } = render(
    <ErrorState
      title="Couldn’t refresh"
      error={{
        ...desktopFailure("listPullRequests", "rate-limit", "Wait before retrying."),
        retryAt,
      }}
      recovery={{ label: "Retry", onAction: () => {} }}
    />,
  );
  expect(screen.getByRole("button", { name: "Retry" })).toBeDisabled();
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  rerender(
    <ErrorState
      title="Cancelled"
      error={desktopFailure("listPullRequests", "cancelled", "Cancelled")}
    />,
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
