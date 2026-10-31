import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { describe, expect, it } from "vitest";

import { PullRequestInboxFilters } from "./PullRequestInboxFilters";

function FilterRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <PullRequestInboxFilters
        authors={[{ login: "alice", displayName: "Alice", avatarUrl: null }]}
      />
      <output aria-label="Filter route">{location.pathname + location.search}</output>
      <button onClick={() => navigate("/pull-requests?q=restored&state=closed")}>
        Restore route
      </button>
    </>
  );
}

function renderFilters(initialEntry = "/pull-requests") {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <FilterRoute />
    </MemoryRouter>,
  );
}

function openMenu(name: string) {
  fireEvent.pointerDown(screen.getByRole("button", { name }), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
}

describe("pull request inbox filter dropdowns", () => {
  it("shows compact controls and combines scope and state in the route", async () => {
    renderFilters();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mine", exact: true })).not.toBeInTheDocument();

    openMenu("Whose pull requests: Everyone");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Mine" }));
    expect(screen.getByRole("status", { name: "Filter route" })).toHaveTextContent(
      "involvement=authored",
    );

    openMenu("Pull request state: Open");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Merged" }));
    expect(screen.getByRole("status", { name: "Filter route" })).toHaveTextContent("state=merged");
    expect(screen.getByRole("status", { name: "Filter route" })).toHaveTextContent(
      "involvement=authored",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pull request state: Merged" })).toHaveFocus(),
    );
  });

  it("restores selected presets from the URL and omits defaults", async () => {
    renderFilters("/pull-requests?state=merged&involvement=authored");
    expect(screen.getByRole("button", { name: "Whose pull requests: Mine" })).toBeInTheDocument();
    openMenu("Pull request state: Merged");
    fireEvent.click(await screen.findByRole("menuitemradio", { name: "Open" }));
    expect(screen.getByRole("status", { name: "Filter route" })).not.toHaveTextContent("state=");
  });

  it("keeps a restored search query instead of overwriting it with the old draft", async () => {
    renderFilters("/pull-requests?q=old");
    fireEvent.click(screen.getByRole("button", { name: "Restore route" }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Search pull requests" })).toHaveValue("restored"),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByRole("status", { name: "Filter route" })).toHaveTextContent("q=restored");
  });
});
