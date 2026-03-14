import { describe, expect, it, vi } from "vitest";

import {
  buildCommandActionItems,
  buildCommandCommitItems,
  buildCommandFileItems,
  splitCommandPath,
} from "@/features/command-palette/buildCommandItems";

describe("buildCommandItems", () => {
  it("splits file path into file and directory", () => {
    expect(splitCommandPath("src/features/file.ts")).toEqual({
      fileName: "file.ts",
      directoryPath: "src/features",
    });

    expect(splitCommandPath("main.ts")).toEqual({
      fileName: "main.ts",
      directoryPath: "",
    });
  });

  it("builds action items with searchable text", () => {
    const onSelect = vi.fn();
    const actions = buildCommandActionItems([
      {
        id: "go:history",
        label: "Go to History",
        subtitle: "/history",
        keywords: ["navigate"],
        onSelect,
      },
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "go:history",
      section: "actions",
      label: "Go to History",
      subtitle: "/history",
    });
    expect(actions[0].searchText).toContain("navigate");
  });

  it("builds file items with readable subtitles", () => {
    const files = buildCommandFileItems([
      {
        path: "apps/desktop/src/App.tsx",
        status: "modified",
        bucket: "unstaged",
        secondaryLabel: "unstaged",
        onSelect: vi.fn(),
      },
    ]);

    expect(files).toHaveLength(1);
    expect(files[0].section).toBe("files");
    expect(files[0].label).toBe("App.tsx");
    expect(files[0].subtitle).toContain("apps/desktop/src");
    expect(files[0].subtitle).toContain("unstaged");
  });

  it("builds history commit items", () => {
    const commits = buildCommandCommitItems([
      {
        commitId: "abc123",
        shortId: "abc123",
        summary: "feat: add command modal",
        author: "Sarah",
        relativeTime: "2 hours ago",
        onSelect: vi.fn(),
      },
    ]);

    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      section: "history",
      commitId: "abc123",
      shortId: "abc123",
      label: "feat: add command modal",
    });
  });
});
