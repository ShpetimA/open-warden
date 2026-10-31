import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceTabs } from "@/components/ui/workspace-tabs";

const items = [
  { id: "project", label: "open-warden", context: "Changes", icon: <span /> },
  { id: "pull-request", label: "#418 Workspace tabs", context: "Pull request", icon: <span /> },
] as const;

describe("WorkspaceTabs", () => {
  it("moves focus and activates the next workspace with the right arrow key", () => {
    const onActivate = vi.fn();

    render(<WorkspaceTabs items={items} activeId="project" onActivate={onActivate} />);

    const project = screen.getByRole("button", { name: "open-warden, Changes" });
    const pullRequest = screen.getByRole("button", { name: "#418 Workspace tabs, Pull request" });

    project.focus();
    fireEvent.keyDown(project, { key: "ArrowRight" });

    expect(pullRequest).toHaveFocus();
    expect(onActivate).toHaveBeenCalledWith("pull-request");
  });

  it("wraps from the first workspace to the last with the left arrow key", () => {
    const onActivate = vi.fn();

    render(<WorkspaceTabs items={items} activeId="project" onActivate={onActivate} />);

    const project = screen.getByRole("button", { name: "open-warden, Changes" });
    const pullRequest = screen.getByRole("button", { name: "#418 Workspace tabs, Pull request" });

    fireEvent.keyDown(project, { key: "ArrowLeft" });

    expect(pullRequest).toHaveFocus();
    expect(onActivate).toHaveBeenCalledWith("pull-request");
  });
});

it("keeps add outside the scrolling strip and restores focus when closing the active tab", () => {
  function Harness() {
    const [openItems, setOpenItems] = useState([...items]);
    return (
      <WorkspaceTabs
        items={openItems}
        activeId={openItems[0]?.id ?? ""}
        onActivate={() => {}}
        onAdd={() => {}}
        onClose={(id) => setOpenItems(openItems.filter((item) => item.id !== id))}
      />
    );
  }
  render(<Harness />);
  const add = screen.getByRole("button", { name: "Open project (⌘O)" });
  expect(screen.getByRole("navigation")).not.toContainElement(add);
  fireEvent.click(screen.getByRole("button", { name: "Close open-warden" }));
  expect(screen.getByRole("button", { name: "#418 Workspace tabs, Pull request" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Close #418 Workspace tabs" }));
  expect(add).toHaveFocus();
});
