import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useDiffAnnotationRenderer } from "./useDiffAnnotationRenderer";

describe("useDiffAnnotationRenderer", () => {
  it("keeps a stable callback while rendering with the latest handlers", () => {
    const { result, rerender } = renderHook(
      ({ label }: { label: string }) =>
        useDiffAnnotationRenderer({
          annotation: () => label,
        }),
      { initialProps: { label: "first" } },
    );
    const initialCallback = result.current;
    const annotation = {
      metadata: {
        type: "annotation" as const,
        id: "comment-1",
        repoPath: "/repo",
        filePath: "src/a.ts",
        bucket: "unstaged" as const,
        startLine: 1,
        endLine: 1,
        side: "additions" as const,
        text: "note",
      },
    };

    expect(result.current(annotation)).toBe("first");

    rerender({ label: "second" });

    expect(result.current).toBe(initialCallback);
    expect(result.current(annotation)).toBe("second");
  });
});
