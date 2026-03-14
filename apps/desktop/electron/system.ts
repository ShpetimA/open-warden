import { execFile as nodeExecFile } from 'node:child_process'
import { constants as fsConstants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import { BrowserWindow, dialog, shell } from 'electron'

const execFile = promisify(nodeExecFile)

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function selectFolder() {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const result = await dialog.showOpenDialog(window ?? undefined, {
    title: 'Open Repository',
    buttonLabel: 'Open Repository',
    properties: ['openDirectory'],
  })

  if (result.canceled) return null
  return result.filePaths[0] ?? null
}

export async function confirm(
  message: string,
  options?: {
    title?: string
    kind?: 'info' | 'warning' | 'error'
    okLabel?: string
    cancelLabel?: string
  },
) {
  const result = await dialog.showMessageBox({
    type: options?.kind ?? 'info',
    title: options?.title ?? 'OpenWarden',
    message,
    buttons: [options?.okLabel ?? 'OK', options?.cancelLabel ?? 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  })

  return result.response === 0
}

export async function checkAppExists(appName: string) {
  if (!appName.trim()) {
    throw new Error('app name is empty')
  }

  if (process.platform === 'darwin') {
    const locations = [
      `/Applications/${appName}.app`,
      `/System/Applications/${appName}.app`,
      path.join(os.homedir(), 'Applications', `${appName}.app`),
    ]

    for (const location of locations) {
      if (await pathExists(location)) {
        return true
      }
    }
  }

  const command = process.platform === 'win32' ? 'where' : 'which'

  try {
    await execFile(command, [appName])
    return true
  } catch {
    return false
  }
}

export async function openPath(targetPath: string, appName?: string | null) {
  if (!targetPath.trim()) {
    throw new Error('path is empty')
  }

  if (appName?.trim()) {
    if (process.platform === 'darwin') {
      await execFile('open', ['-a', appName, targetPath])
      return
    }

    await execFile(appName, [targetPath])
    return
  }

  const error = await shell.openPath(targetPath)
  if (error) {
    throw new Error(error)
  }
}
