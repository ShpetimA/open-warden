import { Minus, Plus, Trash2 } from 'lucide-react'
import type { MouseEvent } from 'react'

import { useAppSelector } from '@/app/hooks'
import type { Bucket, BucketedFile } from '@/features/source-control/types'
import { statusBadge } from '@/features/source-control/utils'

type Props = {
  file: BucketedFile
  onSelectFile: (bucket: Bucket, path: string, event: MouseEvent<HTMLButtonElement>) => void
  onStageFile: (path: string) => void
  onUnstageFile: (path: string) => void
  onDiscardFile: (bucket: Bucket, path: string) => void
  commentCounts: Map<string, number>
}

export function FileRow({
  file,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  commentCounts,
}: Props) {
  const isActive = useAppSelector(
    (state) =>
      state.sourceControl.activeBucket === file.bucket &&
      state.sourceControl.activePath === file.path,
  )
  const staging = useAppSelector(
    (state) =>
      state.sourceControl.runningAction === `file:stage:${file.path}` ||
      state.sourceControl.runningAction === `file:unstage:${file.path}`,
  )
  const discarding = useAppSelector(
    (state) => state.sourceControl.runningAction === `file:discard:${file.path}`,
  )
  const hasRunningAction = useAppSelector((state) => state.sourceControl.runningAction !== '')
  const isSelected = useAppSelector((state) =>
    state.sourceControl.selectedFiles.some(
      (selected) => selected.bucket === file.bucket && selected.path === file.path,
    ),
  )
  const commentCount = commentCounts.get(file.path) ?? 0
  const normalizedPath = file.path.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? file.path
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : ''
  return (
    <div
      className={`border-input group flex min-w-0 items-center gap-2 overflow-hidden border-b px-2 py-1 text-xs last:border-b-0 ${
        isActive ? 'bg-surface-active' : isSelected ? 'bg-accent/50' : 'hover:bg-accent/60'
      }`}
    >
      <button
        type="button"
        className="w-0 min-w-0 flex-1 overflow-hidden text-left"
        onClick={(event) => onSelectFile(file.bucket, file.path, event)}
        title={file.path}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="text-warning w-3 text-center text-[10px]">
            {statusBadge(file.status)}
          </span>
          <span className="text-foreground shrink-0 font-medium">{fileName}</span>
          {commentCount > 0 ? (
            <span className="border-input bg-surface-alt text-foreground inline-flex h-4 min-w-4 items-center justify-center border px-1 text-[10px]">
              {commentCount}
            </span>
          ) : null}
          {directoryPath ? (
            <span className="text-muted-foreground block min-w-0 flex-1 truncate whitespace-nowrap">{` ${directoryPath}`}</span>
          ) : null}
        </div>
      </button>

      <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
        {file.bucket === 'staged' ? (
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
                event.preventDefault()
                event.stopPropagation()
                onDiscardFile(file.bucket, file.path)
              }}
              disabled={staging || discarding || hasRunningAction}
              title="Discard"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
