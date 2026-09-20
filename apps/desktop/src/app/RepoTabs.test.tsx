import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RepoTabs } from "@/app/RepoTabs";

describe("RepoTabs", () => {
  it("scrolls an overflowing repository list with a vertical wheel gesture", () => {
    render(
      <RepoTabs
        repos={["/repo/one", "/repo/two", "/repo/three", "/repo/four"]}
        activeRepo="/repo/one"
        recentRepos={[]}
        onSelectRepo={vi.fn()}
        onCloseRepo={vi.fn()}
        onOpenRecentRepo={vi.fn()}
        onShowAllRecentProjects={vi.fn()}
        onOpenFolder={vi.fn()}
      />,
    );

    const tabList = screen.getByRole("navigation", { name: "Open repositories" });
    Object.defineProperties(tabList, {
      clientWidth: { configurable: true, value: 300 },
      scrollWidth: { configurable: true, value: 900 },
    });

    fireEvent.wheel(tabList, { deltaX: 0, deltaY: 120 });

    expect(tabList.scrollLeft).toBe(120);
  });
});
