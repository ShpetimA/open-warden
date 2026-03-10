import { useEffect, useState } from 'react'

const STORAGE_KEY = 'open-warden.seen-copy-comments-tip'

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function hasSeenTip(): boolean {
  const storage = getLocalStorage()
  return storage?.getItem(STORAGE_KEY) === '1'
}

function markTipSeen(): void {
  const storage = getLocalStorage()
  if (!storage) return
  storage.setItem(STORAGE_KEY, '1')
}

export function useFirstCommentTip() {
  const [showTip, setShowTip] = useState(false)

  useEffect(() => {
    if (!showTip) return

    const timer = setTimeout(() => {
      setShowTip(false)
      markTipSeen()
    }, 5000)

    return () => clearTimeout(timer)
  }, [showTip])

  const showFirstCommentTip = () => {
    if (hasSeenTip()) return
    setShowTip(true)
  }

  const dismissTip = () => {
    if (!showTip) return
    setShowTip(false)
    markTipSeen()
  }

  return { showTip, dismissTip, showFirstCommentTip }
}
