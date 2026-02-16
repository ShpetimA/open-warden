import { ChevronDown, ChevronRight, Minus, Plus, Trash2 } from 'lucide-react'

import { useAppSelector } from '@/app/hooks'
import type { Bucket, BucketedFile } from '@/features/source-control/types'
import { FileRow } from './FileRow'

type Props = {
  sectionKey: 'staged' | 'unstaged'
  title: string
  rows: BucketedFile[]
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
  onDiscardChangesGroup: (files: BucketedFile[]) => void
  commentCounts: Map<string, number>
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
  commentCounts,
}: Props) {
  const runningAction = useAppSelector((state) => state.sourceControl.runningAction)
  const isChanges = sectionKey === 'unstaged'

  return (
    <div className="border-input bg-surface overflow-hidden border">
      <div className="text-foreground/85 hover:bg-accent/60 group flex items-center gap-2 px-2 py-1 text-xs tracking-wide">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => onToggle(sectionKey)}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span className="min-w-0 truncate font-medium">{title}</span>
          {isChanges ? (
            <>
              <span className="bg-surface-alt px-1.5 py-0 text-[10px]">M {unstagedCount}</span>
              <span className="bg-surface-alt px-1.5 py-0 text-[10px]">A {untrackedCount}</span>
            </>
          ) : null}
          <span className="bg-surface-alt ml-auto px-1.5 py-0 text-[10px]">{rows.length}</span>
        </button>

        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100">
          {isChanges ? (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:bg-success/20 hover:text-success p-1"
                title="Stage all"
                disabled={rows.length === 0 || !!runningAction}
                onClick={onStageAll}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:bg-destructive/20 hover:text-destructive p-1"
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
               className="text-muted-foreground hover:bg-secondary hover:text-secondary-foreground p-1"
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
        <div className="border-input border-t">
          {rows.length > 0 ? (
            rows.map((file) => (
              <FileRow
                key={`${file.bucket}-${file.path}`}
                file={file}
                onSelectFile={onSelectFile}
                onStageFile={onStageFile}
                onUnstageFile={onUnstageFile}
                onDiscardFile={onDiscardFile}
                commentCounts={commentCounts}
              />
            ))
          ) : (
            <div className="text-muted-foreground px-2 py-2 text-[11px]">No files.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
