import type { ReactNode } from "react";
import { FileBox } from "lucide-react";

import {
  getFileContentMetadata,
  type FileContent,
  type FileContentMetadata,
} from "@/platform/desktop/fileContent";

type Props = {
  activePath: string;
  metadata: FileContentMetadata;
  oldFile: FileContent | null;
  newFile: FileContent | null;
  mode: "comparison" | "file";
  headerAction?: ReactNode;
  hideHeader?: boolean;
};

export function FileContentNotice({
  activePath,
  metadata,
  oldFile,
  newFile,
  mode,
  headerAction,
  hideHeader = false,
}: Props) {
  const binary = metadata.kind === "binary";

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
          <h2 className="text-sm font-medium">
            {binary ? "Binary file" : "File exceeds the preview limit"}
          </h2>
          <p className="text-muted-foreground max-w-xl text-xs leading-5">
            {binary
              ? "Text preview is unavailable. This file contains binary data or uses an unsupported text encoding."
              : "This file is larger than the 32 MiB preview limit. Its contents have not been loaded."}
          </p>
        </div>

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

  const metadata = getFileContentMetadata(file);
  const formats = {
    binary: "Binary / unsupported text encoding",
    "too-large": "Preview limit exceeded",
  } as const;

  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs">
      <h3 className="font-medium">{label}</h3>
      <p className="break-all font-mono">{file.name}</p>
      {metadata ? (
        <p className="text-muted-foreground tabular-nums">
          {metadata.byteLength.toLocaleString()} bytes
        </p>
      ) : null}
      <p className="text-muted-foreground">{metadata ? formats[metadata.kind] : "UTF-8 text"}</p>
    </div>
  );
}
