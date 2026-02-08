import { AppShell } from '@/app/AppShell'
import { useSourceControlKeyboardNav } from '@/features/source-control/hooks/useSourceControlKeyboardNav'

function App() {
  useSourceControlKeyboardNav()

  return <AppShell />
}

export default App
