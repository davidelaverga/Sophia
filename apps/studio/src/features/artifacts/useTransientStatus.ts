// One line of status for a download (plan §2.8.5): a success fades after about five seconds; an error stays until
// the next attempt replaces it.
import { useEffect, useRef, useState } from 'react'

const FADE_MS = 5000

export function useTransientStatus() {
  const [line, setLine] = useState<{ text: string; error: boolean }>({ text: '', error: false })
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const show = (text: string, error = false) => {
    if (timer.current) clearTimeout(timer.current)
    setLine({ text, error })
    if (!error) timer.current = setTimeout(() => setLine({ text: '', error: false }), FADE_MS)
  }
  return { text: line.text, error: line.error, show }
}
