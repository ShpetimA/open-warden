import { existsSync } from 'node:fs'
import path from 'node:path'

export function resolvePreloadPath(dirname: string) {
  const jsPath = path.join(dirname, 'preload.js')
  if (existsSync(jsPath)) {
    return jsPath
  }

  return path.join(dirname, 'preload.cjs')
}
