// The open sheet's address, to share "look at this": copied, and said so for a moment in the button's tip and name.
import { useRef, useState } from 'react'
import { Icon, Tip } from '@sophia/ui'

export function CopyLink() {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }
  const label = copied ? 'Link copied' : 'Copy link'
  return (
    <button type="button" className="round has-tip" aria-label={label} onClick={() => void copy()}>
      <Icon name="link" />
      <Tip label={label} side="bottom" align="end" />
    </button>
  )
}
