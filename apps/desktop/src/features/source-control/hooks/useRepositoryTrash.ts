import { preparedFileAfterRemoval } from "../components/pierreFileTreeProjection";
import { openFileViewer } from "../sourceControlSlice";
import { fileTrashStarted, fileTrashFinished } from "../fileEditorSlice";
import { useRef, useState } from "react";
import { useStore } from "react-redux";
import { useHotkey } from "@tanstack/react-hotkeys";
import { toast } from "sonner";

import { useAppDispatch } from "@/app/hooks";
import type { RootState } from "@/app/store";
import { desktop } from "@/platform/desktop";
import { readDesktopFailure } from "@/platform/desktop/failure";
import { gitApi } from "../api";
import { repositoryEntryTrashed } from "../sourceControlSlice";
import {
  getPierreFileTreeFocusedEntry,
  getPierreFileTreeVisibleFiles,
  isPierreFileTreeFocused,
  requestPierreFileTreeFocus,
} from "../pierreFileTreeNavigation";
import { isTypingTarget } from "../utils";

export function useRepositoryTrash(repoPath: string, disabled: boolean) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const running = useRef(false);
  const [busy, setBusy] = useState(false);

  async function trash(entry: { path: string; kind: "file" | "directory" }) {
    if (!repoPath || disabled || running.current) return;
    const path = entry.path.replace(/\/$/, "");
    const selection = store.getState().sourceControl.repoTreeActivePath;
    const contains = (file: string) => file === path || file.startsWith(`${path}/`);
    const visible = getPierreFileTreeVisibleFiles("repo-files");
    const active = visible.find((file) => (file.realPath ?? file.path) === selection);
    const nextPath =
      active && contains(selection)
        ? preparedFileAfterRemoval(
            visible.map((file) => file.path),
            active.path,
            new Set(
              visible
                .filter((file) => !file.path.endsWith("/") && !contains(file.realPath ?? file.path))
                .map((file) => file.path),
            ),
          )
        : null;
    const next = visible.find((file) => file.path === nextPath);
    const documents = () =>
      Object.values(store.getState().fileEditor.documents).filter(
        (document) =>
          document?.repoPath === repoPath &&
          (document.relPath === path || document.relPath.startsWith(`${path}/`)),
      );
    if (documents().some((document) => document?.save.kind === "saving")) {
      toast.error("Wait for this file to finish saving before moving it to Trash.");
      return;
    }
    running.current = true;
    setBusy(true);
    dispatch(fileTrashStarted({ repoPath, path }));
    try {
      const dirty = documents().some(
        (document) => document && document.contents !== document.baseContents,
      );
      if (dirty || entry.kind === "directory") {
        const confirmation = await desktop.confirm(
          `${entry.kind === "directory" ? "Move this folder and its contents" : "Move this file"} to Trash?\n\n${path}${dirty ? "\n\nUnsaved edits will be discarded." : ""}`,
          {
            title: "Move to Trash",
            kind: "warning",
            okLabel: "Move to Trash",
            cancelLabel: "Cancel",
          },
        );
        if (!confirmation.ok) {
          toast.error(confirmation.error.message);
          return;
        }
        if (!confirmation.value) return;
      }
      if (documents().some((document) => document?.save.kind === "saving")) {
        toast.error("Wait for this file to finish saving before moving it to Trash.");
        return;
      }
      const operation = dispatch(
        gitApi.endpoints.trashRepositoryEntry.initiate({ repoPath, path }),
      );
      const result = await operation;
      operation.reset();
      if (result.error) {
        toast.error(
          readDesktopFailure(result.error)?.message ?? "Couldn’t move this entry to Trash.",
        );
        return;
      }
      const current = store.getState().sourceControl;
      const replaceSelection =
        current.activeRepo === repoPath &&
        current.repoTreeActivePath === selection &&
        contains(selection);
      dispatch(repositoryEntryTrashed({ repoPath, path }));
      if (replaceSelection && next)
        dispatch(openFileViewer({ repoPath, relPath: next.realPath ?? next.path }));
      if (store.getState().sourceControl.activeRepo === repoPath)
        requestPierreFileTreeFocus(
          "repo-files",
          replaceSelection ? (next?.realPath ?? next?.path) : undefined,
        );
      toast.success(`Moved ${path.split("/").at(-1)} to Trash`);
    } finally {
      dispatch(fileTrashFinished({ repoPath, path }));
      running.current = false;
      setBusy(false);
    }
  }

  useHotkey(
    "D",
    (event) => {
      if (event.repeat || isTypingTarget(event.target) || !isPierreFileTreeFocused("repo-files"))
        return;
      const entry = getPierreFileTreeFocusedEntry("repo-files");
      if (!entry) return;
      event.preventDefault();
      void trash(entry);
    },
    { enabled: Boolean(repoPath) && !disabled && !busy, preventDefault: false },
  );

  return { trash, busy };
}
