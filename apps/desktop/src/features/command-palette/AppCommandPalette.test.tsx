import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { AppCommandPalette } from './AppCommandPalette'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  setTheme: vi.fn(),
  useGetBranchFilesQuery: vi.fn(),
  useGetCommitFilesQuery: vi.fn(),
  useGetCommitHistoryQuery: vi.fn(),
  useGetGitSnapshotQuery: vi.fn(),
  useHotkey: vi.fn(),
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  useHotkey: mocks.useHotkey,
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: mocks.setTheme,
  }),
}))

vi.mock('react-router', () => ({
  useLocation: () => ({
    pathname: '/review',
  }),
  useNavigate: () => mocks.navigate,
}))

vi.mock('@/app/hooks', () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (selector: (state: unknown) => unknown) =>
    selector({
      sourceControl: {
        activeRepo: '/tmp/repo',
        repos: ['/tmp/repo'],
        runningAction: '',
        activeBucket: 'unstaged',
        activePath: '',
        selectedFiles: [],
        commitMessage: '',
        diffStyle: 'split',
        historyCommitId: '',
        reviewBaseRef: 'main',
        reviewHeadRef: 'feature',
        reviewActivePath: 'src/large-file.ts',
      },
      comments: [],
    }),
}))

vi.mock('@/components/ui/command', () => ({
  CommandDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandEmpty: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandInput: ({ placeholder }: { placeholder?: string }) => (
    <input placeholder={placeholder} />
  ),
  CommandItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CommandSeparator: () => <hr />,
  CommandShortcut: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))

vi.mock('@/features/source-control/api', () => ({
  useGetGitSnapshotQuery: mocks.useGetGitSnapshotQuery,
  useGetCommitHistoryQuery: mocks.useGetCommitHistoryQuery,
  useGetCommitFilesQuery: mocks.useGetCommitFilesQuery,
  useGetBranchFilesQuery: mocks.useGetBranchFilesQuery,
}))

describe('AppCommandPalette', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('does not mount review data subscriptions while closed', () => {
    render(<AppCommandPalette open={false} onOpenChange={() => {}} />)

    expect(mocks.useGetBranchFilesQuery).not.toHaveBeenCalled()
    expect(
      screen.queryByPlaceholderText('Search files, commands, or commits...'),
    ).not.toBeInTheDocument()
  })

  test('mounts review data subscriptions when opened', () => {
    mocks.useGetGitSnapshotQuery.mockReturnValue({
      snapshot: { staged: [], unstaged: [], untracked: [] },
    })
    mocks.useGetCommitHistoryQuery.mockReturnValue({ commits: [] })
    mocks.useGetCommitFilesQuery.mockReturnValue({ historyFiles: [] })
    mocks.useGetBranchFilesQuery.mockReturnValue({ reviewFiles: [] })

    render(<AppCommandPalette open onOpenChange={() => {}} />)

    expect(mocks.useGetBranchFilesQuery).toHaveBeenCalledOnce()
    expect(screen.getByPlaceholderText('Search files, commands, or commits...')).toBeInTheDocument()
  })
})
