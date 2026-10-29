import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useStore } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { EditProvider, File as PierreFile, type EditorFactory } from "@pierre/diffs/react";
import { Editor, EditStateManager } from "@pierre/diffs/edit";

import { useAppDispatch, useAppSelector } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { ErrorNotice } from "@/components/ui/error-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCurrentLspDocument } from "@/features/lsp/hooks/useCurrentLspDocument";
import { failureFromUnknown } from "@/platform/desktop/failure";
import { useGetRepoFileQuery } from "../api";
import { saveWorkingFile } from "../fileEditorActions";
import {
  isWorkingFileTrashing,
  fileDocumentChanged,
  fileDocumentClosed,
  fileDocumentOpened,
  fileDocumentReloaded,
  fileSaveFailed,
  workingFileKey,
  type WorkingFileTarget,
} from "../fileEditorSlice";
import type { FileViewerTarget } from "../types";
import { WorkingFileActions } from "./WorkingFileActions";

type WorkingFileEditorProps = ComponentProps<typeof PierreFile> & {
  target: FileViewerTarget;
  editing: boolean;
};

export function WorkingFileEditor({ target, editing, file, ...props }: WorkingFileEditorProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const key = workingFileKey(target);
  const initialFile = useRef<typeof file | null>(null);
  const editorRef = useRef<Editor<"file", unknown, unknown> | null>(null);
  const targetRef = useRef(target);
  const focusedKeyRef = useRef<number | null>(null);
  const restoredEditorRef = useRef(false);
  targetRef.current = target;
  const resetVersion = useAppSelector(
    (state) => state.fileEditor.documents[key]?.resetVersion ?? 0,
  );

  if (!initialFile.current) {
    const document = store.getState().fileEditor.documents[key];
    initialFile.current = {
      ...file,
      contents:
        document && document.contents !== document.baseContents ? document.contents : file.contents,
    };
  }
  const editorFile = initialFile.current;

  useEffect(
    () => () => {
      dispatch(fileDocumentClosed({ repoPath: target.repoPath, relPath: target.relPath }));
    },
    [dispatch, target.repoPath, target.relPath],
  );

  function replaceContents(contents: string) {
    const editor = editorRef.current;
    const state = editor?.getEditState();
    if (!editor || !state || editor.getText() === contents) return;
    editor.applyEdits([
      {
        range: {
          start: { line: 0, character: 0 },
          end: state.document.positionAt(editor.getText().length),
        },
        newText: contents,
      },
    ]);
  }

  useEffect(() => {
    const document = store.getState().fileEditor.documents[key];
    if (
      document &&
      (document.contents !== document.baseContents || document.save.kind === "saving")
    )
      return;
    dispatch(
      fileDocumentOpened({
        repoPath: target.repoPath,
        relPath: target.relPath,
        contents: file.contents,
      }),
    );
    replaceContents(file.contents);
  }, [dispatch, file.contents, key, store, target.repoPath, target.relPath]);

  useEffect(() => {
    if (!resetVersion) return;
    const document = store.getState().fileEditor.documents[key];
    if (document) replaceContents(document.contents);
  }, [key, resetVersion, store]);

  useEffect(() => {
    if (!editing || !target.focusKey) return;
    const frame = requestAnimationFrame(() => {
      if (editorRef.current)
        focusRequestedLocation(editorRef.current, targetRef.current, focusedKeyRef);
    });
    return () => cancelAnimationFrame(frame);
  }, [editing, target.focusKey, target.line, target.column]);

  const createEditor: EditorFactory<unknown, unknown> = (type, options, editStateKey) => {
    if (editStateKey && !restoredEditorRef.current) {
      const previous = EditStateManager.get(type, editStateKey);
      if (previous && previous.document.getText() !== editorFile.contents)
        EditStateManager.clear(type, editStateKey);
    }
    restoredEditorRef.current = true;
    return new Editor(type, options, editStateKey);
  };

  return (
    <>
      <WorkingFileLspSync target={target} fallbackContents={file.contents} />
      <EditProvider createEditor={createEditor}>
        <PierreFile
          {...props}
          file={editorFile}
          edit={editing}
          editStateKey={key}
          editorOptions={{
            ownsVerticalViewport: false,
            onAttach: (editor) => {
              editorRef.current = editor;
              focusRequestedLocation(editor, targetRef.current, focusedKeyRef);
            },
          }}
          onEditChange={({ file: changed }) =>
            dispatch(
              fileDocumentChanged({
                repoPath: target.repoPath,
                relPath: target.relPath,
                baseContents: file.contents,
                contents: changed.contents,
              }),
            )
          }
          onEditComplete={() => "accept"}
        />
      </EditProvider>
    </>
  );
}

function focusRequestedLocation(
  editor: Editor<"file", unknown, unknown>,
  target: FileViewerTarget,
  focusedKey: { current: number | null },
) {
  if (!target.focusKey || focusedKey.current === target.focusKey) return;
  editor.focus({
    lineNumber: target.line ?? 1,
    character: target.column ?? 0,
    preventScroll: true,
  });
  focusedKey.current = target.focusKey;
}

function WorkingFileLspSync({
  target,
  fallbackContents,
}: {
  target: WorkingFileTarget;
  fallbackContents: string;
}) {
  const contents = useAppSelector(
    (state) => state.fileEditor.documents[workingFileKey(target)]?.contents ?? fallbackContents,
  );
  const [settled, setSettled] = useState(contents);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(contents), 150);
    return () => window.clearTimeout(timer);
  }, [contents]);
  useCurrentLspDocument(target.repoPath, target.relPath, settled);
  return null;
}

export function WorkingFileControls({ target }: { target: WorkingFileTarget }) {
  const dispatch = useAppDispatch();
  const removing = useAppSelector((state) => isWorkingFileTrashing(state.fileEditor, target));
  const dirty = useAppSelector((state) => {
    const document = state.fileEditor.documents[workingFileKey(target)];
    return Boolean(document && document.contents !== document.baseContents);
  });
  const save = useAppSelector((state) => state.fileEditor.documents[workingFileKey(target)]?.save);
  const { refetch } = useGetRepoFileQuery(
    { repoPath: target.repoPath, relPath: target.relPath },
    { selectFromResult: () => ({}) },
  );
  const [confirmReload, setConfirmReload] = useState(false);
  const [reloading, setReloading] = useState(false);
  const saving = save?.kind === "saving";
  const error = save?.kind === "failed" ? save.error : null;

  useHotkey(
    "Mod+S",
    (event) => {
      event.preventDefault();
      if (!reloading) void dispatch(saveWorkingFile(target));
    },
    { ignoreInputs: false },
  );

  async function reload() {
    setReloading(true);
    try {
      const file = await refetch().unwrap();
      if (file) dispatch(fileDocumentReloaded({ ...target, contents: file.contents }));
    } catch (cause: unknown) {
      dispatch(fileSaveFailed({ ...target, error: failureFromUnknown(cause, "getRepoFile") }));
    } finally {
      setReloading(false);
    }
  }

  return (
    <>
      <WorkingFileActions
        dirty={dirty}
        saving={saving}
        reloading={reloading}
        removing={removing}
        hasError={Boolean(error)}
        onSave={() => void dispatch(saveWorkingFile(target))}
        onReload={() => setConfirmReload(true)}
      />
      {error ? (
        <div className="absolute right-2 bottom-2 z-20 w-[calc(100%_-_1rem)] max-w-sm rounded-md border bg-surface-elevated shadow-md">
          <ErrorNotice
            title="Couldn’t save file"
            error={error}
            busy={saving}
            recovery={{ label: "Retry", onAction: () => void dispatch(saveWorkingFile(target)) }}
          />
        </div>
      ) : null}
      <AlertDialog open={confirmReload} onOpenChange={setConfirmReload}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reload file from disk?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved changes to {target.relPath} will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reload()}>Reload file</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
