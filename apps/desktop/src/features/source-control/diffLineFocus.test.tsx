import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef } from "react";

import { useDiffLineFocus } from "@/features/source-control/diffLineFocus";

function FocusHarness({
  lineNumber,
  lineCount = null,
  focusKey,
  renderedLineNumbers = [1, 2, 3],
  withScrollContainer = false,
}: {
  lineNumber: number | null;
  lineCount?: number | null;
  focusKey: number | null;
  renderedLineNumbers?: number[];
  withScrollContainer?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useDiffLineFocus({
    containerRef,
    lineNumber,
    lineCount,
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

    for (const renderedLineNumber of renderedLineNumbers) {
      const line = document.createElement("div");
      line.dataset.line = String(renderedLineNumber);
      line.dataset.lineIndex = String(renderedLineNumber - 1);
      line.scrollIntoView = vi.fn();
      shadowRoot.appendChild(line);
    }

    if (!withScrollContainer) {
      return;
    }

    const scrollContainer = containerRef.current?.querySelector<HTMLElement>(
      "[data-scroll-container='true']",
    );
    if (!scrollContainer) {
      return;
    }

    Object.defineProperty(scrollContainer, "scrollHeight", {
      configurable: true,
      value: 10000,
    });
    Object.defineProperty(scrollContainer, "clientHeight", {
      configurable: true,
      value: 400,
    });
    scrollContainer.scrollTop = 0;
  }, [renderedLineNumbers, withScrollContainer]);

  return (
    <div ref={containerRef}>
      {withScrollContainer ? (
        <div data-scroll-container="true" className="file-viewer-scroll" />
      ) : null}
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

    expect(line?.getAttribute("data-app-line-focus")).toBe("true");

    vi.advanceTimersByTime(1000);

    rerender(<FocusHarness lineNumber={2} focusKey={2} />);

    vi.advanceTimersByTime(0);

    vi.advanceTimersByTime(900);
    expect(line?.getAttribute("data-app-line-focus")).toBe("true");

    vi.advanceTimersByTime(900);

    expect(line?.hasAttribute("data-app-line-focus")).toBe(false);
  });

  it("nudges the virtualized scroll container toward the target line when the line is not rendered", () => {
    const { container } = render(
      <FocusHarness
        lineNumber={500}
        lineCount={1200}
        focusKey={1}
        renderedLineNumbers={[1, 2, 3]}
        withScrollContainer
      />,
    );

    vi.advanceTimersByTime(0);

    const scrollContainer = container.querySelector<HTMLElement>("[data-scroll-container='true']");
    expect(scrollContainer?.scrollTop).toBeGreaterThan(0);
  });
});
