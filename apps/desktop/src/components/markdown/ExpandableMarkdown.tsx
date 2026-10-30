import { useLayoutEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Markdown } from "./Markdown";

export function ExpandableMarkdown({
  children,
  previewHeight = 160,
  defaultExpanded = false,
}: {
  children: string;
  previewHeight?: number;
  defaultExpanded?: boolean;
}) {
  const id = useId();
  const content = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [overflows, setOverflows] = useState(false);

  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => setOverflows(element.scrollHeight > previewHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [children, previewHeight]);

  return (
    <div className="min-w-0 max-w-full font-sans whitespace-normal">
      <div
        id={id}
        className="overflow-hidden"
        style={{
          maxHeight: expanded ? undefined : previewHeight,
          maskImage:
            !expanded && overflows
              ? "linear-gradient(to bottom, black calc(100% - 24px), transparent)"
              : undefined,
        }}
      >
        <div ref={content} className="min-w-0 max-w-[76ch]">
          <Markdown className="text-[13px] leading-5 [&_p]:text-[13px] [&_p]:leading-5 [&_li]:text-[13px] [&_li]:leading-5 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_h4]:text-[13px] [&_a]:text-[13px] [&_blockquote]:text-[13px]">
            {children}
          </Markdown>
        </div>
      </div>
      {overflows ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="mt-1 -ml-1 text-muted-foreground"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Read more"}
        </Button>
      ) : null}
    </div>
  );
}
