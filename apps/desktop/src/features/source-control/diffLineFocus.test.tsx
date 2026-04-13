import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef } from "react";

import { useDiffLineFocus } from "@/features/source-control/diffLineFocus";

function FocusHarness({
  lineNumber,
  focusKey,
}: {
  lineNumber: number | null;
  focusKey: number | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useDiffLineFocus({
    containerRef,
    lineNumber,
    focusKey,
    enabled: true,
  });

  useEffect(() => {
    const host = containerRef.current?.querySelector<HTMLElement>("[data-shadow-host]");
    if (!host) {
      return;
    }

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = "";

    for (let index = 1; index <= 3; index += 1) {
      const line = document.createElement("div");
      line.dataset.line = String(index);
      line.dataset.lineIndex = String(index - 1);
      line.scrollIntoView = vi.fn();
      shadowRoot.appendChild(line);
    }
  }, []);

  return (
    <div ref={containerRef}>
      <div data-shadow-host="true" />
    </div>
  );
}

describe("useDiffLineFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        return window.setTimeout(() => callback(performance.now()), 0);
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((handle: number) => {
        window.clearTimeout(handle);
      }),
    );
  });

  it("finds lines through the diff shadow root and refocuses repeated jumps", () => {
    const { rerender, container } = render(<FocusHarness lineNumber={2} focusKey={1} />);

    vi.advanceTimersByTime(0);

    const host = container.querySelector<HTMLElement>("[data-shadow-host]");
    const line = host?.shadowRoot?.querySelector<HTMLElement>('[data-line="2"]');

    expect(line?.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(line?.getAttribute("data-app-line-focus")).toBe("true");

    rerender(<FocusHarness lineNumber={2} focusKey={2} />);

    vi.advanceTimersByTime(0);

    expect(line?.scrollIntoView).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1800);

    expect(line?.hasAttribute("data-app-line-focus")).toBe(false);
  });
});
