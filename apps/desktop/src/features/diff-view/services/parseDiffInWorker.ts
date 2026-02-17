import type { parseDiffFromFile } from '@pierre/diffs'

import type { DiffFile } from '@/features/source-control/types'

type ParsedDiff = ReturnType<typeof parseDiffFromFile>

type ParseResponseMessage =
  | {
      type: 'parsed'
      requestId: number
      data: ParsedDiff
    }
  | {
      type: 'error'
      requestId: number
      message: string
    }

let nextRequestId = 1

function toAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

export function parseDiffInWorker(
  oldFile: DiffFile,
  newFile: DiffFile,
  signal?: AbortSignal,
): Promise<ParsedDiff> {
  const requestId = nextRequestId++

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError())
      return
    }

    const worker = new Worker(new URL('../workers/diff-parse.worker.ts', import.meta.url), {
      type: 'module',
    })

    const cleanup = () => {
      worker.removeEventListener('message', onMessage)
      worker.removeEventListener('error', onError)
      signal?.removeEventListener('abort', onAbort)
      worker.terminate()
    }

    const onAbort = () => {
      cleanup()
      reject(toAbortError())
    }

    const onError = (event: ErrorEvent) => {
      cleanup()
      reject(event.error instanceof Error ? event.error : new Error(event.message))
    }

    const onMessage = (event: MessageEvent<ParseResponseMessage>) => {
      const message = event.data
      if (message.requestId !== requestId) return

      cleanup()
      if (message.type === 'parsed') {
        resolve(message.data)
        return
      }

      reject(new Error(message.message))
    }

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)
    signal?.addEventListener('abort', onAbort, { once: true })

    worker.postMessage({
      type: 'parse',
      requestId,
      oldFile,
      newFile,
    })
  })
}
