import { Check, GitPullRequestArrow, PanelLeft } from 'lucide-react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { toast } from 'sonner'

import { useAppDispatch, useAppSelector } from '@/app/hooks'
import { Button } from '@/components/ui/button'
import { copyComments, copyReviewPrompt, fileComments } from '@/features/comments/actions'
import { compactComments } from '@/features/comments/selectors'
import type { CommentContext } from '@/features/source-control/types'
import { setDiffStyleValue } from '@/features/source-control/actions'

type Props = {
  sidebarOpen: boolean
  onToggleSidebar: () => void
  activePath: string
  commentContext: CommentContext
  canComment: boolean
  showDiffActions: boolean
}

export function DiffWorkspaceHeader({
  sidebarOpen,
  onToggleSidebar,
  activePath,
  commentContext,
  canComment,
  showDiffActions,
}: Props) {
  const dispatch = useAppDispatch()
  const activeRepo = useAppSelector((state) => state.sourceControl.activeRepo)
  const diffStyle = useAppSelector((state) => state.sourceControl.diffStyle)
  const comments = useAppSelector((state) => state.comments)

  const allComments = compactComments(comments)
  const currentRepoComments = activeRepo
    ? allComments.filter((comment) => comment.repoPath === activeRepo)
    : []
  const currentContextComments =
    commentContext.kind === 'review'
      ? currentRepoComments.filter(
          (comment) =>
            comment.contextKind === 'review' &&
            comment.baseRef === commentContext.baseRef &&
            comment.headRef === commentContext.headRef,
        )
      : currentRepoComments.filter((comment) => (comment.contextKind ?? 'changes') === 'changes')
  const currentFileComments = canComment
    ? fileComments(allComments, activeRepo, activePath, commentContext)
    : []

  const onCopyFileComments = async () => {
    const copied = await dispatch(copyComments('file', { context: commentContext, activePath }))
    if (copied) toast.success('Copied file comments')
  }

  const onCopyAllComments = async () => {
    const copied = await dispatch(copyComments('all', { context: commentContext }))
    if (copied) toast.success('Copied comments')
  }

  const onCopyReviewPrompt = async () => {
    if (commentContext.kind !== 'review') return
    const copied = await dispatch(copyReviewPrompt('all', commentContext, activePath))
    if (copied) toast.success('Copied agent review prompt')
  }

  useHotkey(
    'Mod+C',
    () => {
      void onCopyFileComments()
    },
    {
      enabled: showDiffActions && canComment && !!activePath && currentFileComments.length > 0,
    },
  )

  useHotkey(
    'Mod+Alt+C',
    () => {
      void onCopyAllComments()
    },
    {
      enabled: showDiffActions && canComment && currentContextComments.length > 0,
    },
  )

  return (
    <div className="border-border flex items-center gap-1 border-b px-2 py-1">
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
                  void onCopyFileComments()
                }}
                disabled={!activePath || currentFileComments.length === 0}
              >
                Copy Comments (File)
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  void onCopyAllComments()
                }}
                disabled={currentContextComments.length === 0}
              >
                Copy Comments (All)
              </Button>
              {commentContext.kind === 'review' ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void onCopyReviewPrompt()
                  }}
                  disabled={currentContextComments.length === 0}
                >
                  Copy Agent Prompt
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
