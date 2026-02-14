import { AppShell } from '@/app/AppShell'
import { useSourceControlKeyboardNav } from '@/features/source-control/hooks/useSourceControlKeyboardNav'
import { useSourceControlSync } from '@/features/source-control/hooks/useSourceControlSync'

function SourceControlEffects() {
  useSourceControlKeyboardNav()
  useSourceControlSync()
  return null
}

function App() {
  return (
    <>
      <SourceControlEffects />
      <AppShell />
    </>
  )
}

export default App
