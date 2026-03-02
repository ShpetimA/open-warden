import { skipToken } from '@reduxjs/toolkit/query'
import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { ScrollArea } from '@/components/ui/scroll-area'
import { createCommentCountByPathForRepo } from '@/features/comments/selectors'
import { useGetCommitFilesQuery, useGetCommitHistoryQuery } from '@/features/source-control/api'
import { selectHistoryFile } from '@/features/source-control/actions'
import { setHistoryNavTarget } from '@/features/source-control/sourceControlSlice'
import type { FileItem } from '@/features/source-control/types'
import { FileListRow } from './FileListRow'

export function HistoryFilesPane() {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const commentCounts = useAppSelector((state) =>
    createCommentCountByPathForRepo(state.comments, activeRepo),
  )
  const historyCommitId = useAppSelector((state) => state.sourceControl.historyCommitId)
  const { historyCommits } = useGetCommitHistoryQuery(
    activeRepo ? { repoPath: activeRepo } : skipToken,
    {
      selectFromResult: ({ data }) => ({ historyCommits: data ?? [] }),
    },
  )
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
      className="bg-surface-toolbar flex min-h-0 flex-col overflow-hidden"
    >
      <div className="border-border border-b px-3 py-2">
        <div className="text-foreground/80 text-[11px] font-semibold tracking-[0.14em]">
          COMMIT FILES
        </div>
        <div className="text-muted-foreground mt-1 truncate text-xs">
          {selectedCommit
            ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? '' : 's'}`
            : 'No commit selected'}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden">
        {loadingHistoryFiles ? (
          <div className="border-input bg-surface m-2 border px-2 py-2 text-[11px] text-muted-foreground">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="border-input bg-surface m-2 border px-2 py-2 text-[11px] text-muted-foreground">
            No changed files in this commit.
          </div>
        ) : (
          <div>
            {files.map((file) => (
              <HistoryFileRow
                key={`${file.path}:${file.status}`}
                file={file}
                commentCounts={commentCounts}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}

type HistoryFileRowProps = {
  file: FileItem
  commentCounts: Map<string, number>
}

function HistoryFileRow({ file, commentCounts }: HistoryFileRowProps) {
  const dispatch = useAppDispatch()
  const commentCount = commentCounts.get(file.path) ?? 0
  const isActive = useAppSelector((state) => state.sourceControl.activePath === file.path)

  return (
    <FileListRow
      path={file.path}
      status={file.status}
      commentCount={commentCount}
      isActive={isActive}
      onSelect={() => {
        dispatch(setHistoryNavTarget('files'))
        void dispatch(selectHistoryFile(file.path))
      }}
      secondaryLabel={
        file.previousPath && file.previousPath !== file.path ? `from ${file.previousPath}` : undefined
      }
    />
  )
}
