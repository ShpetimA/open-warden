import { RepositoryEntryNameField } from "./RepositoryEntryNameField";
import { useEffect, useRef, useState } from "react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

import { useAppDispatch } from "@/app/hooks";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToolbarAction } from "@/components/ui/toolbar-action";
import { useCreateRepositoryEntryMutation } from "../api";
import { createFileViewerFocusKey } from "../fileViewerNavigation";
import { isPierreFileTreeFocused, requestPierreFileTreeFocus } from "../pierreFileTreeNavigation";
import { openFileViewer } from "../sourceControlSlice";
import { isTypingTarget } from "../utils";
import { readDesktopFailure } from "@/platform/desktop/failure";

export function CreateRepositoryEntry({
  repoPath,
  active,
  busy = false,
  onStart,
}: {
  repoPath: string;
  active: boolean;
  busy?: boolean;
  onStart: () => void;
}) {
  useHotkey(
    "Mod+N",
    (event) => {
      event.preventDefault();
      onStart();
    },
    { enabled: Boolean(repoPath) && !active && !busy, ignoreInputs: false },
  );
  useHotkey(
    "N",
    (event) => {
      if (isTypingTarget(event.target) || !isPierreFileTreeFocused("repo-files")) return;
      event.preventDefault();
      onStart();
    },
    { enabled: Boolean(repoPath) && !active && !busy, preventDefault: false },
  );

  return (
    <TooltipProvider delayDuration={450}>
      <ToolbarAction
        label="New file or folder"
        description="⌘N · N in the file tree"
        disabledReason={
          !repoPath
            ? "Open a repository first"
            : active
              ? "Finish naming the new entry"
              : busy
                ? "Moving to Trash…"
                : undefined
        }
        onClick={onStart}
      >
        <FilePlus2 />
      </ToolbarAction>
    </TooltipProvider>
  );
}

export function InlineRepositoryEntry({
  repoPath,
  prefix,
  onClose,
}: {
  repoPath: string;
  prefix: string;
  onClose: (options: { restoreFocus: boolean }) => void;
}) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState("");
  const [createEntry, { isLoading, error, reset }] = useCreateRepositoryEntryMutation();
  const mounted = useRef(false);
  const submitting = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const failure = readDesktopFailure(error);
  useEffect(() => {
    mounted.current = true;
    const cancelOutside = (event: globalThis.PointerEvent) => {
      const form = inputRef.current?.form;
      if (!submitting.current && (!form || !event.composedPath().includes(form))) {
        closeRef.current({ restoreFocus: false });
      }
    };
    document.addEventListener("pointerdown", cancelOutside, true);
    return () => {
      mounted.current = false;
      document.removeEventListener("pointerdown", cancelOutside, true);
      toast.dismiss("create-repository-entry");
    };
  }, []);

  async function create() {
    if (submitting.current) return;
    if (!name.trim()) {
      onClose({ restoreFocus: true });
      return;
    }
    submitting.current = true;
    const result = await createEntry({ repoPath, path: `${prefix}${name}` });
    if (!mounted.current) return;
    if (result.error) {
      submitting.current = false;
      toast.error(readDesktopFailure(result.error)?.message ?? "Couldn’t create this path.", {
        id: "create-repository-entry",
      });
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (result.data.kind === "file") {
      dispatch(
        openFileViewer({
          repoPath,
          relPath: result.data.path,
          focusKey: createFileViewerFocusKey(),
        }),
      );
    } else {
      requestPierreFileTreeFocus("repo-files", result.data.path);
    }
    onClose({ restoreFocus: false });
  }

  return (
    <RepositoryEntryNameField
      inputRef={inputRef}
      prefix={prefix}
      value={name}
      busy={isLoading}
      error={failure?.message ?? null}
      onSubmit={() => void create()}
      onCancel={() => {
        if (!submitting.current) onClose({ restoreFocus: true });
      }}
      onChange={(value) => {
        setName(value);
        if (error) {
          reset();
          toast.dismiss("create-repository-entry");
        }
      }}
      onLeave={() => {
        if (!submitting.current) onClose({ restoreFocus: false });
      }}
    />
  );
}
