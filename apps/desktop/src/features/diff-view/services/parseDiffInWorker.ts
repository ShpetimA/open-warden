import type { parseDiffFromFile } from '@pierre/diffs'

import type { DiffFile } from '@/features/source-control/types'

type ParsedDiff = ReturnType<typeof parseDiffFromFile>
type ParseWorkerFile = DiffFile & { cacheKey?: string }
export type ParsePriority = 'high' | 'low'

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

type QueueItem = {
  requestId: number
  oldFile: ParseWorkerFile
  newFile: ParseWorkerFile
  resolve: (value: ParsedDiff) => void
  reject: (reason?: unknown) => void
  signal?: AbortSignal
  aborted: boolean
  priority: ParsePriority
  onAbort: () => void
}

let worker: Worker | null = null
let activeItem: QueueItem | null = null
const queuedItems: QueueItem[] = []

function priorityWeight(priority: ParsePriority): number {
  return priority === 'high' ? 1 : 0
}

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(new URL('../workers/diff-parse.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.addEventListener('message', onWorkerMessage)
  worker.addEventListener('error', onWorkerError)
  return worker
}

function queueTask(task: QueueItem) {
  if (task.priority === 'high' && activeItem) {
    interruptActiveTask()
  }

  queuedItems.push(task)
  queuedItems.sort((left, right) => {
    const priorityDelta = priorityWeight(right.priority) - priorityWeight(left.priority)
    if (priorityDelta !== 0) return priorityDelta
    return left.requestId - right.requestId
  })
}

function cleanupTask(task: QueueItem) {
  task.signal?.removeEventListener('abort', task.onAbort)
}

function startNextTask() {
  if (activeItem) return

  while (queuedItems.length > 0) {
    const nextItem = queuedItems.shift()
    if (!nextItem) return
    if (nextItem.aborted) {
      cleanupTask(nextItem)
      continue
    }

    activeItem = nextItem
    getWorker().postMessage({
      type: 'parse',
      requestId: nextItem.requestId,
      oldFile: nextItem.oldFile,
      newFile: nextItem.newFile,
    })
    return
  }
}

function finishActiveTask(callback: (task: QueueItem) => void) {
  const task = activeItem
  if (!task) return

  activeItem = null
  cleanupTask(task)
  callback(task)
  startNextTask()
}

function interruptActiveTask() {
  const task = activeItem
  if (!task) return

  activeItem = null
  task.aborted = true
  cleanupTask(task)
  recreateWorker()
  task.reject(toAbortError())
}

function recreateWorker() {
  if (!worker) return

  worker.removeEventListener('message', onWorkerMessage)
  worker.removeEventListener('error', onWorkerError)
  worker.terminate()
  worker = null
}

function onWorkerMessage(event: MessageEvent<ParseResponseMessage>) {
  const message = event.data
  if (!activeItem || message.requestId !== activeItem.requestId) return

  finishActiveTask((task) => {
    if (task.aborted) return

    if (message.type === 'parsed') {
      task.resolve(message.data)
      return
    }

    task.reject(new Error(message.message))
  })
}

function onWorkerError(event: ErrorEvent) {
  const error = event.error instanceof Error ? event.error : new Error(event.message)

  const task = activeItem
  if (!task) {
    recreateWorker()
    return
  }

  activeItem = null
  cleanupTask(task)
  if (!task.aborted) {
    task.reject(error)
  }
  recreateWorker()
  startNextTask()
}

function toAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError')
}

export function parseDiffInWorker(
  oldFile: ParseWorkerFile,
  newFile: ParseWorkerFile,
  signal?: AbortSignal,
  priority: ParsePriority = 'high',
): Promise<ParsedDiff> {
  const requestId = nextRequestId++

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(toAbortError())
      return
    }

    const task: QueueItem & { onAbort: () => void } = {
      requestId,
      oldFile,
      newFile,
      resolve,
      reject,
      signal,
      aborted: false,
      priority,
      onAbort: () => {
        if (task.aborted) return
        task.aborted = true

        const queuedIndex = queuedItems.findIndex((item) => item.requestId === requestId)
        if (queuedIndex >= 0) {
          queuedItems.splice(queuedIndex, 1)
          cleanupTask(task)
        } else if (activeItem?.requestId === requestId) {
          cleanupTask(task)
          activeItem = null
          recreateWorker()
          startNextTask()
        }

        reject(toAbortError())
      },
    }

    signal?.addEventListener('abort', task.onAbort, { once: true })
    queueTask(task)
    startNextTask()
  })
}
