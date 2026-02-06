import { observable } from '@legendapp/state'

import type { Bucket, CommentItem, DiffFile, DiffStyle, GitSnapshot, RunningAction } from './types'

export const appState$ = observable({
  repos: [] as string[],
  activeRepo: '',
  snapshot: null as GitSnapshot | null,
  activeBucket: 'unstaged' as Bucket,
  activePath: '',
  patch: '',
  oldFile: null as DiffFile | null,
  newFile: null as DiffFile | null,
  diffContextLines: 10,
  diffStyle: 'split' as DiffStyle,
  comments: [] as CommentItem[],
  commitMessage: '',
  loadingSnapshot: false,
  loadingPatch: false,
  runningAction: '' as RunningAction,
  error: '',
})
