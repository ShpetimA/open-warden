import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecentProjectsPicker } from "@/features/source-control/RecentProjectsPicker";

describe("RecentProjectsPicker", () => {
  beforeEach(() => {
    Object.defineProperty(window, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });

    Element.prototype.scrollIntoView = vi.fn();
  });

  it("filters recent projects and opens the selected repo", () => {
    const onOpenChange = vi.fn();
    const onSelectRepo = vi.fn();

    render(
      <RecentProjectsPicker
        open
        activeRepo="/tmp/open-warden"
        recentRepos={["/tmp/open-warden", "/tmp/agent-tool"]}
        onOpenChange={onOpenChange}
        onSelectRepo={onSelectRepo}
        onChooseFolder={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText("Select to open a recent project or choose a folder..."),
      {
        target: { value: "agent" },
      },
    );

    expect(screen.getByText("agent-tool")).toBeInTheDocument();
    expect(screen.queryByText("open-warden")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("agent-tool"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSelectRepo).toHaveBeenCalledWith("/tmp/agent-tool");
  });

  it("can fall back to choosing a folder", () => {
    const onOpenChange = vi.fn();
    const onChooseFolder = vi.fn();

    render(
      <RecentProjectsPicker
        open
        activeRepo=""
        recentRepos={[]}
        onOpenChange={onOpenChange}
        onSelectRepo={vi.fn()}
        onChooseFolder={onChooseFolder}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create or Open Folder" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChooseFolder).toHaveBeenCalledTimes(1);
  });
});
