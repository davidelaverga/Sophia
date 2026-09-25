// Status tag: text always states the status; the tone only reinforces it (never color alone).
import type { ReactNode } from 'react'

export type Tone = 'teal' | 'amber' | 'lav' | 'rose' | 'muted'

export function Tag({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`tag ${tone}`}>
      <span className="dot" aria-hidden />
      {children}
    </span>
  )
}
