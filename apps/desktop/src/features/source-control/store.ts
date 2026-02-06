import { observable } from '@legendapp/state'

import type { Bucket, CommentItem, DiffStyle, GitSnapshot, RunningAction } from './types'

export const appState$ = observable({
  repos: [] as string[],
  activeRepo: '',
  snapshot: null as GitSnapshot | null,
  activeBucket: 'unstaged' as Bucket,
  activePath: '',
  patch: '',
  diffStyle: 'split' as DiffStyle,
  comments: [] as CommentItem[],
  commitMessage: '',
  loadingSnapshot: false,
  loadingPatch: false,
  runningAction: '' as RunningAction,
  error: '',
})
