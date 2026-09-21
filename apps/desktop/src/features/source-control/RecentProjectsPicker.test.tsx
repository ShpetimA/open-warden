import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("filters recent projects and opens the selected repo", async () => {
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

    fireEvent.change(screen.getByPlaceholderText("Search projects or type a path, ~/proj/…"), {
      target: { value: "agent" },
    });

    expect(screen.getByText("agent-tool")).toBeInTheDocument();
    expect(screen.queryByText("open-warden")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("agent-tool"));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
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

    fireEvent.click(screen.getByRole("button", { name: "Choose folder…" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onChooseFolder).toHaveBeenCalledTimes(1);
  });
  it("browses paths and keeps invalid repositories open", async () => {
    const onOpenChange = vi.fn();
    const onSelectRepo = vi.fn().mockResolvedValue(false);
    const browseDirectory = vi.fn(async (path: string) => ({
      ok: true as const,
      path: path === "~/" ? "/home/test" : "/home/test/project",
      parentPath: "/home/test",
      entries: path === "~/" ? [{ name: "project", path: "/home/test/project" }] : [],
    }));
    render(
      <RecentProjectsPicker
        open
        activeRepo=""
        recentRepos={[]}
        onOpenChange={onOpenChange}
        onSelectRepo={onSelectRepo}
        onChooseFolder={vi.fn()}
        browseDirectory={browseDirectory}
      />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "~/" } });
    fireEvent.click(await screen.findByText("project"));
    await waitFor(() => expect(browseDirectory).toHaveBeenCalledWith("/home/test/project/"));
    fireEvent.click(screen.getByRole("button", { name: "Open project" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Git repository");
    expect(onSelectRepo).toHaveBeenCalledWith("/home/test/project/");
    expect(onOpenChange).not.toHaveBeenCalled();
  });
  it("completes a folder with Tab and opens the typed path with the shortcut", async () => {
    const onSelectRepo = vi.fn().mockResolvedValue(true);
    const browseDirectory = vi.fn(async () => ({
      ok: true as const,
      path: "/projects",
      parentPath: "/",
      entries: [{ name: "warden", path: "/projects/warden" }],
    }));
    render(
      <RecentProjectsPicker
        open
        activeRepo=""
        recentRepos={[]}
        onOpenChange={vi.fn()}
        onSelectRepo={onSelectRepo}
        onChooseFolder={vi.fn()}
        browseDirectory={browseDirectory}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "/projects/war" } });
    await screen.findByText("warden");
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input).toHaveValue("/projects/warden/");
    fireEvent.change(input, { target: { value: "/projects/war" } });
    await screen.findByText("warden");
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", ctrlKey: true });
    await waitFor(() => expect(onSelectRepo).toHaveBeenCalledWith("/projects/war"));
    expect(input).toHaveValue("/projects/war");
  });
});
