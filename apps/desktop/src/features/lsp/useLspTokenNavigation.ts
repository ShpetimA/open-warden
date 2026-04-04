import { toast } from "sonner";
import type { DiffTokenEventBaseProps, TokenEventBase } from "@pierre/diffs";
import { useAppDispatch } from "@/app/hooks";
import { createFocusedFileViewerTarget } from "@/features/source-control/fileViewerNavigation";
import { desktop } from "@/platform/desktop";
import {
  openFileViewer,
  openSymbolPeek,
} from "@/features/source-control/sourceControlSlice";

type LspTokenDocument = {
  repoPath: string;
  relPath: string;
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

export function useLspTokenNavigation(document?: LspTokenDocument) {
  const dispatch = useAppDispatch();

  function createPeekPayload(
    kind: "definitions" | "references",
    locations: Awaited<ReturnType<typeof desktop.getLspDefinition>>,
    props: TokenPosition,
  ) {
    const lineElement = props.tokenElement.closest<HTMLElement>("[data-line]");

    return {
      kind,
      locations,
      activeIndex: 0,
      query: "",
      sourceDocument: document!,
      anchor: {
        lineNumber: props.lineNumber,
        lineIndex: lineElement?.getAttribute("data-line-index") ?? null,
      },
    } as const;
  }

  const onTokenClick = (props: TokenPosition, event: MouseEvent) => {
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

          if (locations.length === 1) {
            dispatch(openFileViewer(createFocusedFileViewerTarget(locations[0])));
            return;
          }

          dispatch(
            openSymbolPeek(createPeekPayload("references", locations, props)),
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

        if (locations.length === 1) {
          dispatch(openFileViewer(createFocusedFileViewerTarget(locations[0])));
          return;
        }

        dispatch(
          openSymbolPeek(createPeekPayload("definitions", locations, props)),
        );
      })
      .catch((error) => {
        toast.error("Failed to get definition", {
          description: error instanceof Error ? error.message : String(error),
        });
      });
  };

  return {
    onTokenClick,
  };
}
