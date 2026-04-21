import { useCallback } from "react";
import { toast } from "sonner";
import type { DiffTokenEventBaseProps, TokenEventBase } from "@pierre/diffs";
import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";
import { openSymbolPeek } from "@/features/source-control/sourceControlSlice";
import type { DiffReturnTarget } from "@/features/source-control/types";

type LspTokenDocument = {
  repoPath: string;
  relPath: string;
};

type LspJumpSource = {
  lineNumber: number;
  lineIndex: string | null;
};

type UseLspTokenNavigationOptions = {
  getReturnToDiffTarget?: (source: LspJumpSource) => DiffReturnTarget | null;
};

type TokenPosition = Pick<TokenEventBase, "lineNumber" | "lineCharStart" | "tokenElement"> & {
  side?: DiffTokenEventBaseProps["side"];
};

function toLspPosition({
  lineNumber,
  lineCharStart,
}: Pick<TokenPosition, "lineNumber" | "lineCharStart">) {
  return {
    line: lineNumber,
    character: lineCharStart,
  };
}

function isDefinitionClick(event: MouseEvent) {
  return (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey;
}

function isReferencesClick(event: MouseEvent) {
  return event.altKey || ((event.metaKey || event.ctrlKey) && event.shiftKey);
}

function getTokenLineIndex(tokenElement: HTMLElement) {
  const lineElement = tokenElement.closest<HTMLElement>("[data-line]");
  return lineElement?.getAttribute("data-line-index") ?? null;
}

export function useLspTokenNavigation(
  document?: LspTokenDocument,
  options?: UseLspTokenNavigationOptions,
) {
  const dispatch = useAppDispatch();
  const getReturnToDiffTarget = options?.getReturnToDiffTarget;

  const createPeekPayload = useCallback(
    (
      kind: "definitions" | "references",
      locations: Awaited<ReturnType<typeof desktop.getLspDefinition>>,
      source: LspJumpSource,
      returnToDiff: DiffReturnTarget | null,
    ) => {
      return {
        kind,
        locations,
        activeIndex: 0,
        query: "",
        sourceDocument: document!,
        anchor: {
          lineNumber: source.lineNumber,
          lineIndex: source.lineIndex,
        },
        returnToDiff,
      } as const;
    },
    [document],
  );

  const onTokenClick = useCallback(
    (props: TokenPosition, event: MouseEvent) => {
      if (!document) {
        return;
      }

      if (props.side && props.side !== "additions") {
        return;
      }

      const definitionClick = isDefinitionClick(event);
      const referencesClick = isReferencesClick(event);

      if (!definitionClick && !referencesClick) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const position = toLspPosition(props);
      const source: LspJumpSource = {
        lineNumber: props.lineNumber,
        lineIndex: getTokenLineIndex(props.tokenElement),
      };
      const returnToDiff = getReturnToDiffTarget?.(source) ?? null;

      if (referencesClick) {
        void desktop
          .getLspReferences({
            ...document,
            ...position,
            includeDeclaration: false,
          })
          .then((locations) => {
            if (locations.length === 0) {
              toast.info("No references found.");
              return;
            }

            dispatch(
              openSymbolPeek(createPeekPayload("references", locations, source, returnToDiff)),
            );
          })
          .catch((error) => {
            toast.error("Failed to get references", {
              description: error instanceof Error ? error.message : String(error),
            });
          });
        return;
      }

      void desktop
        .getLspDefinition({
          ...document,
          ...position,
        })
        .then((locations) => {
          if (locations.length === 0) {
            toast.info("No definition found.");
            return;
          }

          dispatch(
            openSymbolPeek(createPeekPayload("definitions", locations, source, returnToDiff)),
          );
        })
        .catch((error) => {
          toast.error("Failed to get definition", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [createPeekPayload, dispatch, document, getReturnToDiffTarget],
  );

  return {
    onTokenClick,
  };
}
