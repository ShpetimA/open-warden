import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { expect, test } from "vitest";
import type { ReactNode } from "react";

import { rootReducer } from "@/app/store";
import { useDiffCommentAnnotations } from "./useDiffCommentAnnotations";

test("updates a live drag range and opens a composer only when the selection ends", () => {
  const store = configureStore({ reducer: rootReducer });
  const { result } = renderHook(
    () =>
      useDiffCommentAnnotations({
        activePath: "src/invoice.ts",
        commentContext: { kind: "changes" },
        canComment: true,
      }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    },
  );
  const start = { start: 2, end: 2, side: "additions" as const };
  const range = { start: 2, end: 5, side: "additions" as const };
  const initialStartHandler = result.current.onLineSelectionStart;

  act(() => result.current.onLineSelectionStart(start));
  act(() => result.current.onLineSelectionChange(range));
  expect(result.current.selectedRange).toEqual(range);
  expect(
    result.current.annotations.some((annotation) => annotation.metadata?.type === "composer"),
  ).toBe(false);
  expect(result.current.onLineSelectionStart).toBe(initialStartHandler);

  act(() => result.current.onLineSelectionEnd(range));
  expect(result.current.annotations).toContainEqual(
    expect.objectContaining({
      lineNumber: 5,
      metadata: expect.objectContaining({ type: "composer", startLine: 2, endLine: 5 }),
    }),
  );

  act(() => result.current.onCloseCommentComposer());
  expect(result.current.selectedRange).toBeNull();
  expect(result.current.annotations).toEqual([]);
});
