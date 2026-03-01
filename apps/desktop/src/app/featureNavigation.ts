import { GitBranch, GitPullRequestArrow, History, MessageSquare } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export type FeatureKey = 'changes' | 'history' | 'review' | 'comments'

export type FeatureNavItem = {
  key: FeatureKey
  path: `/${FeatureKey}`
  label: string
  icon: LucideIcon
}

export const FEATURE_NAV_ITEMS: FeatureNavItem[] = [
  { key: 'changes', path: '/changes', label: 'Changes', icon: GitPullRequestArrow },
  { key: 'history', path: '/history', label: 'History', icon: History },
  { key: 'review', path: '/review', label: 'Review', icon: GitBranch },
  { key: 'comments', path: '/comments', label: 'Comments', icon: MessageSquare },
]

export function featureKeyFromPath(pathname: string): FeatureKey {
  if (pathname.startsWith('/history')) return 'history'
  if (pathname.startsWith('/review')) return 'review'
  if (pathname.startsWith('/comments')) return 'comments'
  return 'changes'
}

export function featureHasPrimarySidebar(feature: FeatureKey): boolean {
  return feature === 'changes' || feature === 'history'
}
