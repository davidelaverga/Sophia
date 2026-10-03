// Copying a session's id or a sheet's address: said for a moment when it worked, and said, with what to do instead,
// when the browser refused (no clipboard, permission denied). A press never passes in silence.
import { useRef, useState } from 'react'

export type CopyState = 'idle' | 'copied' | 'failed'

const SHOWN: Record<Exclude<CopyState, 'idle'>, number> = { copied: 1600, failed: 4000 }

export function useCopy(text: () => string) {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const settle = (next: Exclude<CopyState, 'idle'>) => {
    setState(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), SHOWN[next])
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text())
      settle('copied')
    } catch {
      settle('failed')
    }
  }
  return { state, copy: () => void copy() }
}
