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
