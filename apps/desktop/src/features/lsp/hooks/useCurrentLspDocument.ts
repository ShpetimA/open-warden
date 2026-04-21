import { useEffect, useRef } from "react";

import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";

import { clearLspFile } from "../lspSlice";

type ActiveDocument = {
  repoPath: string;
  relPath: string;
};

function sameDocument(current: ActiveDocument | null, next: ActiveDocument | null) {
  if (!current || !next) {
    return current === next;
  }

  return current.repoPath === next.repoPath && current.relPath === next.relPath;
}

export function useCurrentLspDocument(repoPath: string, relPath: string, text: string | null) {
  const dispatch = useAppDispatch();
  const activeDocumentRef = useRef<ActiveDocument | null>(null);

  useEffect(() => {
    const nextDocument = repoPath && relPath && text !== null ? { repoPath, relPath } : null;
    const currentDocument = activeDocumentRef.current;

    if (!sameDocument(currentDocument, nextDocument) && currentDocument) {
      void desktop.closeLspDocument(currentDocument);
      dispatch(clearLspFile(currentDocument));
    }

    activeDocumentRef.current = nextDocument;

    if (!nextDocument || text === null) {
      return;
    }

    void desktop.syncLspDocument({
      ...nextDocument,
      text,
    });
  }, [dispatch, relPath, repoPath, text]);

  useEffect(() => {
    return () => {
      const currentDocument = activeDocumentRef.current;
      if (!currentDocument) {
        return;
      }

      void desktop.closeLspDocument(currentDocument);
      dispatch(clearLspFile(currentDocument));
      activeDocumentRef.current = null;
    };
  }, [dispatch]);
}
