import { Minus, Plus, Trash2 } from 'lucide-react'

import { useAppSelector } from '@/app/hooks'
import { countCommentsForFile } from '@/features/comments/selectors'
import type { Bucket, BucketedFile } from '@/features/source-control/types'
import { statusBadge } from '@/features/source-control/utils'

type Props = {
  file: BucketedFile
  onSelectFile: (bucket: Bucket, path: string) => void
  onStageFile: (path: string) => void
  onUnstageFile: (path: string) => void
  onDiscardFile: (bucket: Bucket, path: string) => void
}

export function FileRow({
  file,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
}: Props) {
  const isActive = useAppSelector(
    (state) => state.sourceControl.activeBucket === file.bucket && state.sourceControl.activePath === file.path,
  )
  const staging = useAppSelector((state) =>
    state.sourceControl.runningAction === `file:stage:${file.path}` ||
    state.sourceControl.runningAction === `file:unstage:${file.path}`,
  )
  const discarding = useAppSelector(
    (state) => state.sourceControl.runningAction === `file:discard:${file.path}`,
  )
  const hasRunningAction = useAppSelector((state) => state.sourceControl.runningAction !== '')
  const commentCount = useAppSelector((state) =>
    countCommentsForFile(state.comments, state.sourceControl.activeRepo, file.path),
  )
  const normalizedPath = file.path.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? file.path
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : ''
  return (
    <div
      className={`group flex min-w-0 items-center gap-2 overflow-hidden border-b border-[#2b2d34] px-2 py-1 text-xs last:border-b-0 ${
        isActive ? 'bg-[#2b303b]' : 'hover:bg-[#23252b]'
      }`}
    >
      <button
        type="button"
        className="w-0 min-w-0 flex-1 overflow-hidden text-left"
        onClick={() => onSelectFile(file.bucket, file.path)}
        title={file.path}
      >
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="w-3 text-center text-[10px] text-[#e39a59]">{statusBadge(file.status)}</span>
          <span className="shrink-0 font-medium text-[#eef1f8]">{fileName}</span>
          {commentCount > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center border border-[#4a5166] bg-[#2a3040] px-1 text-[10px] text-[#dce3f6]">
              {commentCount}
            </span>
          ) : null}
          {directoryPath ? (
            <span className="block min-w-0 flex-1 truncate whitespace-nowrap text-[#9ca4b9]">{` ${directoryPath}`}</span>
          ) : null}
        </div>
      </button>

      <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
        {file.bucket === 'staged' ? (
          <button
            type="button"
            className="p-1 text-[#b6bbca] hover:bg-[#384255] hover:text-white"
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
              className="p-1 text-[#b6bbca] hover:bg-[#314838] hover:text-white"
              onClick={() => onStageFile(file.path)}
              disabled={staging || discarding || hasRunningAction}
              title="Stage"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="p-1 text-[#b6bbca] hover:bg-[#4b2f34] hover:text-white"
              onClick={() => onDiscardFile(file.bucket, file.path)}
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
