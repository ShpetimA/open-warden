import type { DiffFile } from '@/features/source-control/types'

const MAX_DIFF_BUFFER_SIZE = 70_000_000

export const MAX_REASONABLE_DIFF_SIZE = Math.floor(MAX_DIFF_BUFFER_SIZE / 16)

export const MAX_DIFF_LINE_LENGTH = 5000

export type DiffRenderGate = 'large' | 'renderable' | 'unrenderable'

function getDiffContentSize(file: DiffFile | null): number {
  return file?.contents.length ?? 0
}

function exceedsMaxLineLength(contents: string): boolean {
  let currentLineLength = 0

  for (let index = 0; index < contents.length; index += 1) {
    const charCode = contents.charCodeAt(index)

    if (charCode === 10 || charCode === 13) {
      currentLineLength = 0

      if (charCode === 13 && contents.charCodeAt(index + 1) === 10) {
        index += 1
      }

      continue
    }

    currentLineLength += 1
    if (currentLineLength > MAX_DIFF_LINE_LENGTH) {
      return true
    }
  }

  return false
}

export function getDiffRenderGate(
  activePath: string | null,
  oldFile: DiffFile | null,
  newFile: DiffFile | null,
): DiffRenderGate | null {
  if (!activePath || (!oldFile && !newFile)) return null

  const totalDiffSize = getDiffContentSize(oldFile) + getDiffContentSize(newFile)
  if (totalDiffSize > MAX_DIFF_BUFFER_SIZE) {
    return 'unrenderable'
  }

  if (totalDiffSize >= MAX_REASONABLE_DIFF_SIZE) {
    return 'large'
  }

  if (oldFile && exceedsMaxLineLength(oldFile.contents)) {
    return 'large'
  }

  if (newFile && exceedsMaxLineLength(newFile.contents)) {
    return 'large'
  }

  return 'renderable'
}
