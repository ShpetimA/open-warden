import type { ReactNode } from "react";
import { FileBox } from "lucide-react";

import {
  getFileContentMetadata,
  type FileContent,
  type FileContentMetadata,
  type FileModeChange,
} from "@/platform/desktop/fileContent";

export type FileContentNoticeReason =
  | { metadata: FileContentMetadata; modeChange?: FileModeChange }
  | { metadata?: never; modeChange: FileModeChange };

type Props = {
  notice: FileContentNoticeReason;
  activePath: string;
  oldFile: FileContent | null;
  newFile: FileContent | null;
  mode: "comparison" | "file";
  headerAction?: ReactNode;
  hideHeader?: boolean;
};

export function FileContentNotice({
  activePath,
  notice,
  oldFile,
  newFile,
  mode,
  headerAction,
  hideHeader = false,
}: Props) {
  const { metadata, modeChange } = notice;
  const messages = {
    binary: {
      title: "Binary file",
      description:
        "Text preview is unavailable. This file contains binary data or uses an unsupported text encoding.",
    },
    "too-large": {
      title: "File exceeds the preview limit",
      description:
        "This file is larger than the 32 MiB preview limit. Its contents have not been loaded.",
    },
    symlink: {
      title: "Symbolic link",
      description: "Only the link target is shown. Target contents are not read or edited.",
    },
    submodule: {
      title: "Submodule",
      description:
        "This entry records a commit in another repository. Its files are not shown as a text diff.",
    },
  } as const;
  const message = metadata
    ? messages[metadata.kind]
    : {
        title: "File permissions changed",
        description: "The file contents are unchanged.",
      };

  return (
    <section
      className="bg-background flex h-full min-h-0 min-w-0 flex-col"
      aria-label="File information"
    >
      {!hideHeader ? (
        <header className="bg-surface-toolbar flex min-w-0 items-center gap-2 border-b px-3 py-2">
          <FileBox className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate font-mono text-xs" title={activePath}>
            {activePath}
          </span>
          {headerAction}
        </header>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">{message.title}</h2>
          <p className="text-muted-foreground max-w-xl text-xs leading-5">{message.description}</p>
        </div>

        {modeChange ? <FileModeChangeNotice change={modeChange} /> : null}

        <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
          {mode === "comparison" ? <VersionDetails label="Before" file={oldFile} /> : null}
          <VersionDetails label={mode === "comparison" ? "After" : "File"} file={newFile} />
        </div>
      </div>
    </section>
  );
}

function VersionDetails({ label, file }: { label: string; file: FileContent | null }) {
  if (!file) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        <h3 className="font-medium">{label}</h3>
        <p className="text-muted-foreground">Not present</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs">
      <h3 className="font-medium">{label}</h3>
      <p className="break-all font-mono">{file.name}</p>
      <ContentDetails file={file} />
    </div>
  );
}

function ContentDetails({ file }: { file: FileContent }) {
  const metadata = getFileContentMetadata(file);

  if (!metadata) return <p className="text-muted-foreground">UTF-8 text</p>;

  switch (metadata.kind) {
    case "binary":
    case "too-large":
      return (
        <>
          <p className="text-muted-foreground tabular-nums">
            {metadata.byteLength.toLocaleString()} bytes
          </p>
          <p className="text-muted-foreground">
            {metadata.kind === "binary"
              ? "Binary / unsupported text encoding"
              : "Preview limit exceeded"}
          </p>
        </>
      );
    case "symlink":
      return (
        <>
          <p className="text-muted-foreground">Link target</p>
          <p className="whitespace-pre-wrap break-all font-mono">{metadata.target}</p>
        </>
      );
    case "submodule":
      return (
        <>
          <p className="text-muted-foreground">Commit</p>
          <p className="break-all font-mono">{metadata.commitId}</p>
          {metadata.workingTree?.state === "uninitialized" ? (
            <p className="text-muted-foreground">Not initialized</p>
          ) : null}
          {metadata.workingTree?.state === "checked-out" ? (
            <div className="text-muted-foreground flex flex-col gap-1">
              {metadata.workingTree.trackedChanges ? <p>Uncommitted tracked changes</p> : null}
              {metadata.workingTree.untrackedChanges ? <p>Untracked files</p> : null}
              {!metadata.workingTree.trackedChanges && !metadata.workingTree.untrackedChanges ? (
                <p>Working tree clean</p>
              ) : null}
            </div>
          ) : null}
        </>
      );
  }
}

export function FileModeChangeNotice({ change }: { change: FileModeChange }) {
  let label = "File type changed";

  if (change.before === "100644" && change.after === "100755")
    label = "Executable permission added";
  if (change.before === "100755" && change.after === "100644")
    label = "Executable permission removed";

  return (
    <div
      className="bg-surface-toolbar flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-2 text-xs"
      role="note"
      aria-label="Git file mode change"
    >
      <span>{label}</span>
      <span className="text-muted-foreground font-mono tabular-nums">
        {change.before} → {change.after}
      </span>
    </div>
  );
}
