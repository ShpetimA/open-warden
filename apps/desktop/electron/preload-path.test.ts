import { beforeEach, describe, expect, test, vi } from 'vitest'

const existsSync = vi.fn<(path: string) => boolean>()

vi.mock('node:fs', () => ({
  existsSync,
  default: {
    existsSync,
  },
}))

describe('resolvePreloadPath', () => {
  beforeEach(() => {
    existsSync.mockReset()
  })

  test('prefers preload.js when Forge emits a js preload bundle', async () => {
    existsSync.mockReturnValueOnce(true)

    const { resolvePreloadPath } = await import('./preload-path')

    expect(resolvePreloadPath('/tmp/build')).toBe('/tmp/build/preload.js')
    expect(existsSync).toHaveBeenCalledWith('/tmp/build/preload.js')
  })

  test('falls back to preload.cjs when no js preload bundle exists', async () => {
    existsSync.mockReturnValueOnce(false)

    const { resolvePreloadPath } = await import('./preload-path')

    expect(resolvePreloadPath('/tmp/build')).toBe('/tmp/build/preload.cjs')
    expect(existsSync).toHaveBeenCalledWith('/tmp/build/preload.js')
  })
})
