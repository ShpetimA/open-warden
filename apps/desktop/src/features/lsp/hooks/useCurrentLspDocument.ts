import { useEffect, useRef } from "react";

import { useAppDispatch } from "@/app/hooks";
import { desktop } from "@/platform/desktop";

import { clearLspFile } from "../lspSlice";

type ActiveDocument = {
  repoPath: string;
  relPath: string;
};

export type CurrentLspDocument = ActiveDocument & {
  text: string;
};

function documentKey(document: ActiveDocument) {
  return `${document.repoPath}\u0000${document.relPath}`;
}

export function useCurrentLspDocuments(documents: CurrentLspDocument[]) {
  const dispatch = useAppDispatch();
  const activeDocumentsRef = useRef(new Map<string, CurrentLspDocument>());
  const documentsKey = documents
    .map((document) => `${documentKey(document)}\u0000${document.text.length}`)
    .join("\u0001");

  useEffect(() => {
    const nextDocuments = new Map(documents.map((document) => [documentKey(document), document]));

    for (const [key, currentDocument] of activeDocumentsRef.current) {
      if (nextDocuments.has(key)) continue;
      void desktop.closeLspDocument(currentDocument);
      dispatch(clearLspFile(currentDocument));
      activeDocumentsRef.current.delete(key);
    }

    for (const [key, nextDocument] of nextDocuments) {
      const currentDocument = activeDocumentsRef.current.get(key);
      if (currentDocument?.text === nextDocument.text) continue;

      activeDocumentsRef.current.set(key, nextDocument);
      void desktop.syncLspDocument(nextDocument);
    }
  }, [dispatch, documents, documentsKey]);

  useEffect(() => {
    return () => {
      for (const currentDocument of activeDocumentsRef.current.values()) {
        void desktop.closeLspDocument(currentDocument);
        dispatch(clearLspFile(currentDocument));
      }
      activeDocumentsRef.current.clear();
    };
  }, [dispatch]);
}
