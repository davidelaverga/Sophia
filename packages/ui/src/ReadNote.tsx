// A read note (docs/plans/states.md): the one line that says a read is on («Loading the report…», «Comparing…») where
// a skeleton would be too much: the third ink in the body type (`.read-note`), a status a screen reader hears once.
import type { ReactNode } from 'react'

export interface ReadNoteProps {
  children: ReactNode
  className?: string
}

export function ReadNote({ children, className }: ReadNoteProps) {
  return (
    <p className={['read-note', className?.trim()].filter(Boolean).join(' ')} role="status">
      {children}
    </p>
  )
}
