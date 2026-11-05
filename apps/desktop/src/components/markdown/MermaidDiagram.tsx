import DOMPurify from "dompurify";
import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";

type DiagramState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly svg: string }
  | { readonly kind: "failed" };

let renderQueue: Promise<void> = Promise.resolve();

function renderDiagram(id: string, code: string, dark: boolean): Promise<string> {
  // Mermaid owns global configuration; serialize theme setup with rendering across documents.
  const result = renderQueue.then(async () => {
    const { default: mermaid } = await import("mermaid");

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      theme: dark ? "dark" : "default",
      htmlLabels: false,
      maxTextSize: 50_000,
      maxEdges: 500,
    });

    const { svg } = await mermaid.render(id, code);

    return DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } });
  });

  renderQueue = result.then(
    () => {},
    () => {},
  );

  return result;
}

export function MermaidDiagram({ code }: { readonly code: string }) {
  const { resolvedTheme } = useTheme();

  return <Diagram key={`${resolvedTheme}:${code}`} code={code} dark={resolvedTheme === "dark"} />;
}

function Diagram({ code, dark }: { readonly code: string; readonly dark: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const [state, setState] = useState<DiagramState>({ kind: "loading" });
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let disposed = false;

    void renderDiagram(`mermaid-${id}`, code, dark).then(
      (svg) => {
        if (!disposed) setState({ kind: "ready", svg });
      },
      () => {
        if (!disposed) setState({ kind: "failed" });
      },
    );

    return () => {
      disposed = true;
    };
  }, [code, dark, id]);

  return (
    <figure className="border-border bg-surface mb-2 overflow-hidden rounded-lg border">
      <figcaption className="border-border text-muted-foreground flex items-center justify-between border-b px-3 py-1 text-xs">
        <span>
          {state.kind === "failed" ? "Could not render Mermaid diagram" : "Mermaid diagram"}
        </span>
        <Button
          variant="toolbar"
          size="xs"
          aria-pressed={showSource}
          onClick={() => setShowSource(!showSource)}
        >
          Source
        </Button>
      </figcaption>

      {state.kind === "ready" && !showSource ? (
        <div
          role="img"
          aria-label="Mermaid diagram"
          className="overflow-auto p-3 [&_svg]:mx-auto [&_svg]:max-w-full"
          dangerouslySetInnerHTML={{ __html: state.svg }}
        />
      ) : (
        <pre className="max-h-96 overflow-auto p-3 text-xs" aria-busy={state.kind === "loading"}>
          <code>{code}</code>
        </pre>
      )}
    </figure>
  );
}
