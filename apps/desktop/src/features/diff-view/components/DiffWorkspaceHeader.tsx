import { Check, GitPullRequestArrow, PanelLeft } from 'lucide-react'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { copyComments, fileComments } from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import { setDiffStyleValue } from '@/features/source-control/actions'

type Props = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  canComment: boolean
  showDiffActions: boolean
}

export function DiffWorkspaceHeader({ sidebarOpen, onToggleSidebar, canComment, showDiffActions }: Props) {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const activePath = useAppSelector((state) => state.sourceControl.activePath)
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle)
  const comments = useAppSelector((state) => state.comments)

  const allComments = compactComments(comments)
  const currentFileComments = canComment ? fileComments(allComments, activeRepo, activePath) : []

  return (
    <div className="flex items-center gap-1 border-b border-[#2f3138] px-2 py-1">
      <Button
        size="sm"
        variant="ghost"
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Close Source Control' : 'Open Source Control'}
      >
        <PanelLeft className="mr-1 h-3.5 w-3.5" />
        {sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'}
      </Button>

      {showDiffActions ? (
        <>
          <Button
            size="sm"
            variant={diffStyle === 'split' ? 'secondary' : 'ghost'}
            onClick={() => dispatch(setDiffStyleValue('split'))}
          >
            <GitPullRequestArrow className="mr-1 h-3.5 w-3.5" /> Split
          </Button>
          <Button
            size="sm"
            variant={diffStyle === 'unified' ? 'secondary' : 'ghost'}
            onClick={() => dispatch(setDiffStyleValue('unified'))}
          >
            <Check className="mr-1 h-3.5 w-3.5" /> Unified
          </Button>

          {canComment ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void dispatch(copyComments('file'))
                }}
                disabled={!activePath || currentFileComments.length === 0}
              >
                Copy Comments (File)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void dispatch(copyComments('all'))
                }}
                disabled={allComments.length === 0}
              >
                Copy Comments (All)
              </Button>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
