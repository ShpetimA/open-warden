import { useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'open-warden.seen-copy-comments-tip'

function hasSeenTip(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function markTipSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } catch {
  }
}

export function useFirstCommentTip(commentCount: number) {
  const [showTip, setShowTip] = useState(false)
  const prevCountRef = useRef(commentCount)

  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = commentCount

    if (prev === 0 && commentCount > 0 && !hasSeenTip()) {
      setShowTip(true)
    }
  }, [commentCount])

  useEffect(() => {
    if (!showTip) return
    const timer = setTimeout(() => {
      setShowTip(false)
      markTipSeen()
    }, 5000)
    return () => clearTimeout(timer)
  }, [showTip])

  const dismissTip = () => {
    setShowTip(false)
    markTipSeen()
  }

  return { showTip, dismissTip }
}
