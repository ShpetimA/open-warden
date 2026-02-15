import { skipToken } from '@reduxjs/toolkit/query'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ScrollArea } from '@/components/ui/scroll-area'
import { countCommentsForFile } from '@/features/comments/selectors'
import { useGetCommitFilesQuery, useGetCommitHistoryQuery } from '@/features/source-control/api'
import { selectHistoryFile } from '@/features/source-control/actions'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import type { FileItem } from '@/features/source-control/types'
import { statusBadge } from '@/features/source-control/utils'

export function HistoryFilesPane() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const { historyCommits } = useGetCommitHistoryQuery(activeRepo ? { repoPath: activeRepo } : skipToken, {
    selectFromResult: ({ data }) => ({ historyCommits: data ?? [] }),
  })
  const { historyFiles, loadingHistoryFiles } = useGetCommitFilesQuery(
    activeRepo && historyCommitId ? { repoPath: activeRepo, commitId: historyCommitId } : skipToken,
    {
      selectFromResult: ({ data, isFetching }) => ({
        historyFiles: data ?? [],
        loadingHistoryFiles: isFetching,
      }),
    },
  )

  const selectedCommit = historyCommits.find((commit) => commit?.commitId === historyCommitId)
  const files = historyFiles as FileItem[]

  return (
    <aside
      onMouseDown={() => {
        dispatch(setHistoryNavTarget('files'))
      }}
      className="border-border bg-surface flex min-h-0 flex-col overflow-hidden border-r"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">COMMIT FILES</div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {selectedCommit
            ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? '' : 's'}`
            : 'No commit selected'}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2 ">
        {loadingHistoryFiles ? (
          <div className="border-input bg-surface border px-2 py-2 text-[11px] text-muted-foreground">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="border-input bg-surface border px-2 py-2 text-[11px] text-muted-foreground">
            No changed files in this commit.
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => (
              <HistoryFileRow key={`${file.path}:${file.status}`} file={file} />
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}

type HistoryFileRowProps = {
  file: FileItem
}

function HistoryFileRow({ file }: HistoryFileRowProps) {
  const dispatch = useAppDispatch()
  const commentCount = useAppSelector((state) =>
    countCommentsForFile(state.comments, state.sourceControl.activeRepo, file.path),
  )
  const isActive = useAppSelector((state) => state.sourceControl.activePath === file.path)

  const normalizedPath = file.path.replace(/\\/g, '/')
  const pathParts = normalizedPath.split('/').filter(Boolean)
  const fileName = pathParts[pathParts.length - 1] ?? file.path
  const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : ''
  return (
    <button
      type="button"
      className={`block w-full min-w-0 overflow-hidden border px-2 py-1.5 text-left ${
        isActive
          ? 'border-ring/40 bg-surface-active'
          : 'border-input bg-surface hover:bg-accent/60'
      }`}
      title={file.path}
      onClick={() => {
        dispatch(setHistoryNavTarget('files'))
        void dispatch(selectHistoryFile(file.path))
      }}
    >
      <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs">
        <span className="text-warning w-3 text-center text-[10px]">{statusBadge(file.status)}</span>
        <span className="text-foreground w-0 min-w-0 flex-1 truncate font-medium">{fileName}</span>
        {commentCount > 0 ? (
          <span className="border-input bg-surface-alt text-foreground inline-flex h-4 min-w-4 items-center justify-center border px-1 text-[10px]">
            {commentCount}
          </span>
        ) : null}
        {directoryPath ? <span className="text-muted-foreground max-w-[45%] shrink truncate">{directoryPath}</span> : null}
      </div>

      {file.previousPath && file.previousPath !== file.path ? (
        <div className="text-muted-foreground mt-0.5 truncate pl-5 text-[11px]">from {file.previousPath}</div>
      ) : null}
    </button>
  )
}
