import { AppShell } from '@/app/AppShell'
import { useSourceControlKeyboardNav } from '@/features/source-control/hooks/useSourceControlKeyboardNav'
import { useSourceControlSync } from '@/features/source-control/hooks/useSourceControlSync'
import { Toaster } from 'sonner'

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
      <Toaster theme="dark" richColors />
    </>
  )
}

export default App
