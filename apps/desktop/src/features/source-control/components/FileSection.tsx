import { ChevronDown, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react'
import { useSelector } from '@legendapp/state/react'

import { appState$ } from '@/features/source-control/store'
import type { Bucket, FileItem } from '@/features/source-control/types'
import { FileRow } from './FileRow'

type Props = {
  sectionKey: 'staged' | 'unstaged'
  title: string
  rows: Array<FileItem & { bucket: Bucket }>
  collapsed: boolean
  unstagedCount: number
  untrackedCount: number
  onToggle: (key: 'staged' | 'unstaged') => void
  onSelectFile: (bucket: Bucket, path: string) => void
  onStageFile: (path: string) => void
  onUnstageFile: (path: string) => void
  onDiscardFile: (bucket: Bucket, path: string) => void
  onStageAll: () => void
  onUnstageAll: () => void
  onDiscardChangesGroup: (files: Array<FileItem & { bucket: Bucket }>) => void
}

export function FileSection({
  sectionKey,
  title,
  rows,
  collapsed,
  unstagedCount,
  untrackedCount,
  onToggle,
  onSelectFile,
  onStageFile,
  onUnstageFile,
  onDiscardFile,
  onStageAll,
  onUnstageAll,
  onDiscardChangesGroup,
}: Props) {
  const runningAction = useSelector(appState$.runningAction)
  const isChanges = sectionKey === 'unstaged'

  return (
    <div className="overflow-hidden border border-[#34343a] bg-[#1a1b1f]">
      <div className="group flex items-center gap-2 px-2 py-1 text-xs tracking-wide text-[#d0d3da] hover:bg-[#24262c]">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onToggle(sectionKey)}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span className="min-w-0 truncate font-medium">{title}</span>
          {isChanges ? (
            <>
              <span className="bg-[#30323a] px-1.5 py-0 text-[10px]">M {unstagedCount}</span>
              <span className="bg-[#30323a] px-1.5 py-0 text-[10px]">A {untrackedCount}</span>
            </>
          ) : null}
          <span className="ml-auto bg-[#30323a] px-1.5 py-0 text-[10px]">{rows.length}</span>
        </button>

        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {isChanges ? (
            <>
              <button
                type="button"
                className="p-1 text-[#b6bbca] hover:bg-[#314838] hover:text-white"
                title="Stage all"
                disabled={rows.length === 0 || !!runningAction}
                onClick={onStageAll}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="p-1 text-[#b6bbca] hover:bg-[#4b2f34] hover:text-white"
                title="Discard changes"
                disabled={rows.length === 0 || !!runningAction}
                onClick={() => onDiscardChangesGroup(rows)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="p-1 text-[#b6bbca] hover:bg-[#384255] hover:text-white"
              title="Unstage all"
              disabled={rows.length === 0 || !!runningAction}
              onClick={onUnstageAll}
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {!collapsed ? (
        <div className="border-t border-[#30323a]">
          {rows.length > 0 ? (
            rows.map((file) => (
              <FileRow
                key={`${file.bucket}-${file.path}`}
                file={file}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
              />
            ))
          ) : (
            <div className="px-2 py-2 text-[11px] text-[#8c92a5]">No files.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
