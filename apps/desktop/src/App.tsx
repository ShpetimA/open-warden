import { AppThemeProvider } from '@/app/AppThemeProvider'
import { AppShell } from '@/app/AppShell'
import { Toaster } from '@/components/ui/sonner'
import { CommentsScreen } from '@/features/comments/screens/CommentsScreen'
import { ChangesScreen } from '@/features/source-control/screens/ChangesScreen'
import { HistoryScreen } from '@/features/source-control/screens/HistoryScreen'
import { ReviewScreen } from '@/features/source-control/screens/ReviewScreen'
import { Navigate, RouterProvider, createHashRouter } from 'react-router'

const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <Navigate to="/changes" replace />,
      },
      {
        path: 'changes',
        element: <ChangesScreen />,
      },
      {
        path: 'history',
        element: <HistoryScreen />,
      },
      {
        path: 'review',
        element: <ReviewScreen />,
      },
      {
        path: 'comments',
        element: <CommentsScreen />,
      },
      {
        path: '*',
        element: <Navigate to="/changes" replace />,
      },
    ],
  },
])

function App() {
  return (
    <AppThemeProvider>
      <RouterProvider router={router} />
      <Toaster richColors />
    </AppThemeProvider>
  )
}

export default App
