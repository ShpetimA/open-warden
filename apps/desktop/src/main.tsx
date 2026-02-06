import { createRoot } from 'react-dom/client'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import './index.css'
import App from './App.tsx'
import { workerFactory } from './lib/diffs-worker'

document.documentElement.classList.add('dark')
document.documentElement.style.colorScheme = 'dark'

createRoot(document.getElementById('root')!).render(
  <WorkerPoolContextProvider
    poolOptions={{
      workerFactory,
      totalASTLRUCacheSize: 200,
    }}
    highlighterOptions={{}}
  >
    <App />
  </WorkerPoolContextProvider>,
)
