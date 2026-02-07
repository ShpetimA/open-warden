import { useSelector } from '@legendapp/state/react'

import { ScrollArea } from '@/components/ui/scroll-area'
import { safeComments } from '@/features/comments/selectors'
import { selectHistoryFile } from '@/features/source-control/actions'
import { appState$ } from '@/features/source-control/store'
import type { FileItem } from '@/features/source-control/types'
import { statusBadge } from '@/features/source-control/utils'

export function HistoryFilesPane() {
  const activeRepo = useSelector(appState$.activeRepo)
  const historyCommits = useSelector(appState$.historyCommits)
  const historyCommitId = useSelector(appState$.historyCommitId)
  const historyFiles = useSelector(appState$.historyFiles)
  const activePath = useSelector(appState$.activePath)
  const comments = useSelector(appState$.comments)
  const loadingHistoryFiles = useSelector(appState$.loadingHistoryFiles)

  const selectedCommit = historyCommits.find((commit) => commit?.commitId === historyCommitId)
  const files = historyFiles as FileItem[]

  return (
    <aside
      onMouseDown={() => {
        appState$.historyNavTarget.set('files')
      }}
      className="flex min-h-0 flex-col overflow-hidden border-r border-[#2f3138] bg-[#16171c]"
    >
      <div className="border-b border-[#2f3138] px-3 py-2">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#aeb5c6]">COMMIT FILES</div>
        <div className="mt-1 truncate text-xs text-[#7f8698]">
          {selectedCommit
            ? `${selectedCommit.shortId} · ${historyFiles.length} file${historyFiles.length === 1 ? '' : 's'}`
            : 'No commit selected'}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1 overflow-hidden p-2 ">
        {loadingHistoryFiles ? (
          <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
            Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="border border-[#30323a] bg-[#1a1b1f] px-2 py-2 text-[11px] text-[#8c92a5]">
            No changed files in this commit.
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file) => {
              const normalizedPath = file.path.replace(/\\/g, '/')
              const pathParts = normalizedPath.split('/').filter(Boolean)
              const fileName = pathParts[pathParts.length - 1] ?? file.path
              const directoryPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : ''
              const isActive = activePath === file.path
              const commentCount = safeComments(comments).filter(
                (comment) => comment.repoPath === activeRepo && comment.filePath === file.path,
              ).length

              return (
                <button
                  key={`${file.path}:${file.status}`}
                  type="button"
                  className={`block w-full min-w-0 overflow-hidden border px-2 py-1.5 text-left ${
                    isActive
                      ? 'border-[#445172] bg-[#262d3d]'
                      : 'border-[#30323a] bg-[#1a1b1f] hover:bg-[#23262d]'
                  }`}
                  title={file.path}
                  onClick={() => {
                    appState$.historyNavTarget.set('files')
                    void selectHistoryFile(file.path)
                  }}
                >
                  <div className="flex min-w-0 items-center gap-2 overflow-hidden text-xs">
                    <span className="w-3 text-center text-[10px] text-[#e39a59]">{statusBadge(file.status)}</span>
                    <span className="w-0 min-w-0 flex-1 truncate font-medium text-[#eef1f8]">{fileName}</span>
                    {commentCount > 0 ? (
                      <span className="inline-flex h-4 min-w-4 items-center justify-center border border-[#4a5166] bg-[#2a3040] px-1 text-[10px] text-[#dce3f6]">
                        {commentCount}
                      </span>
                    ) : null}
                    {directoryPath ? (
                      <span className="max-w-[45%] shrink truncate text-[#9ca4b9]">{directoryPath}</span>
                    ) : null}
                  </div>

                  {file.previousPath && file.previousPath !== file.path ? (
                    <div className="mt-0.5 truncate pl-5 text-[11px] text-[#8f96a8]">from {file.previousPath}</div>
                  ) : null}
                </button>
              )
            })}
          </div>
        )}
      </ScrollArea>
    </aside>
  )
}
