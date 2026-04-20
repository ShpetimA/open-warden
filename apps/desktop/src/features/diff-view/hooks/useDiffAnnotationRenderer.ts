import { useCallback } from "react";

import type { DiffAnnotationItem } from "@/features/source-control/types";

type AnnotationRenderers = {
  composer?: (data: Extract<DiffAnnotationItem, { type: "composer" }>) => React.ReactNode;
  "pull-request-anchor"?: (
    data: Extract<DiffAnnotationItem, { type: "pull-request-anchor" }>,
  ) => React.ReactNode;
  "pull-request-thread"?: (
    data: Extract<DiffAnnotationItem, { type: "pull-request-thread" }>,
  ) => React.ReactNode;
  diagnostic?: (data: Extract<DiffAnnotationItem, { type: "diagnostic" }>) => React.ReactNode;
  annotation?: (data: Extract<DiffAnnotationItem, { type: "annotation" }>) => React.ReactNode;
};

export function useDiffAnnotationRenderer(renderers: AnnotationRenderers) {
  return useCallback(
    (annotation: { metadata?: DiffAnnotationItem }) => {
      const data = annotation.metadata;
      if (!data) return null;

      switch (data.type) {
        case "composer":
          return renderers.composer?.(data) ?? null;
        case "pull-request-anchor":
          return renderers["pull-request-anchor"]?.(data) ?? null;
        case "pull-request-thread":
          return renderers["pull-request-thread"]?.(data) ?? null;
        case "diagnostic":
          return renderers.diagnostic?.(data) ?? null;
        case "annotation":
          return renderers.annotation?.(data) ?? null;
        default:
          return null;
      }
    },
    [renderers],
  );
}
