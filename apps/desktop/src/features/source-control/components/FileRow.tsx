import { Minus, Plus, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";

import { useAppSelector } from "@/app/hooks";
import { countCommentsForPathInRepoContext } from "@/features/comments/selectors";
import type { Bucket, BucketedFile } from "@/features/source-control/types";
import { FileListRow } from "./FileListRow";

type Props = {
  file: BucketedFile;
  navIndex?: number;
  depth?: number;
  label?: string;
  showDirectoryPath?: boolean;
  onSelectFile: (bucket: Bucket, path: string, event: MouseEvent<HTMLButtonElement>) => void;
  onStageFile: (path: string) => void;
  onUnstageFile: (path: string) => void;
  onDiscardFile: (bucket: Bucket, path: string) => void;
  activeRepo: string;
};

export function FileRow({
  file,
  navIndex,
  depth,
  label,
  showDirectoryPath,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  activeRepo,
}: Props) {
  const isActive = useAppSelector(
    (state) =>
      state.sourceControl.activeBucket === file.bucket &&
      state.sourceControl.activePath === file.path,
  );
  const staging = useAppSelector(
    (state) =>
      state.sourceControl.runningAction === `file:stage:${file.path}` ||
      state.sourceControl.runningAction === `file:unstage:${file.path}`,
  );
  const discarding = useAppSelector(
    (state) => state.sourceControl.runningAction === `file:discard:${file.path}`,
  );
  const hasRunningAction = useAppSelector((state) => state.sourceControl.runningAction !== "");
  const isSelected = useAppSelector((state) =>
    state.sourceControl.selectedFiles.some(
      (selected) => selected.bucket === file.bucket && selected.path === file.path,
    ),
  );
  const commentCount = useAppSelector((state) =>
    countCommentsForPathInRepoContext(state.comments, activeRepo, file.path, { kind: "changes" }),
  );

  return (
    <FileListRow
      path={file.path}
      status={file.status}
      commentCount={commentCount}
      isActive={isActive}
      isSelected={isSelected}
      navIndex={navIndex}
      depth={depth}
      label={label}
      showDirectoryPath={showDirectoryPath}
      dataBucket={file.bucket}
      onSelect={(event) => onSelectFile(file.bucket, file.path, event)}
      actions={
        file.bucket === "staged" ? (
          <button
            type="button"
            className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground p-1"
            onClick={() => onUnstageFile(file.path)}
            disabled={staging || discarding || hasRunningAction}
            title="Unstage"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
        ) : (
          <>
            <button
              type="button"
              className="text-muted-foreground hover:bg-success/20 hover:text-success p-1"
              onClick={() => onStageFile(file.path)}
              disabled={staging || discarding || hasRunningAction}
              title="Stage"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="text-muted-foreground hover:bg-destructive/20 hover:text-destructive p-1"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDiscardFile(file.bucket, file.path);
              }}
              disabled={staging || discarding || hasRunningAction}
              title="Discard"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )
      }
    />
  );
}
