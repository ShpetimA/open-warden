import { useCallback, useRef } from "react";

import type { DiffAnnotationItem } from "@/features/source-control/types";

type AnnotationRenderers = {
  guidance?: (data: Extract<DiffAnnotationItem, { type: "guidance" }>) => React.ReactNode;
  composer?: (data: Extract<DiffAnnotationItem, { type: "composer" }>) => React.ReactNode;
  "pull-request-anchor"?: (
    data: Extract<DiffAnnotationItem, { type: "pull-request-anchor" }>,
  ) => React.ReactNode;
  "pull-request-thread"?: (
    data: Extract<DiffAnnotationItem, { type: "pull-request-thread" }>,
  ) => React.ReactNode;
  diagnostic?: (data: Extract<DiffAnnotationItem, { type: "diagnostic" }>) => React.ReactNode;
  annotation?: (data: Extract<DiffAnnotationItem, { type: "annotation" }>) => React.ReactNode;
  "hunk-action"?: (data: Extract<DiffAnnotationItem, { type: "hunk-action" }>) => React.ReactNode;
};

export function useDiffAnnotationRenderer(renderers: AnnotationRenderers) {
  const renderersRef = useRef(renderers);
  renderersRef.current = renderers;

  return useCallback((annotation: { metadata?: DiffAnnotationItem }) => {
    const data = annotation.metadata;
    if (!data) return null;

    const currentRenderers = renderersRef.current;

    switch (data.type) {
      case "guidance":
        return currentRenderers.guidance?.(data) ?? null;
      case "composer":
        return currentRenderers.composer?.(data) ?? null;
      case "pull-request-anchor":
        return currentRenderers["pull-request-anchor"]?.(data) ?? null;
      case "pull-request-thread":
        return currentRenderers["pull-request-thread"]?.(data) ?? null;
      case "diagnostic":
        return currentRenderers.diagnostic?.(data) ?? null;
      case "annotation":
        return currentRenderers.annotation?.(data) ?? null;
      case "hunk-action":
        return currentRenderers["hunk-action"]?.(data) ?? null;
      default:
        return null;
    }
  }, []);
}
