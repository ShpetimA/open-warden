import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import './index.css'
import App from './App.tsx'
import { store } from './app/store'
import { workerFactory } from './lib/diffs-worker'

document.documentElement.classList.add('dark')
document.documentElement.style.colorScheme = 'dark'

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory,
        totalASTLRUCacheSize: 200,
      }}
      highlighterOptions={{}}
    >
      <App />
    </WorkerPoolContextProvider>
  </Provider>,
)
