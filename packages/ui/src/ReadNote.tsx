// A read note (docs/plans/states.md): the one line that says a read is on («Loading the report…», «Comparing…») where
// a skeleton would be too much: the third ink in the body type (`.read-note`), a status a screen reader hears once.
import { useEffect, useState, type ReactNode } from 'react'

export interface ReadNoteProps {
  children: ReactNode
  className?: string
}

export function ReadNote({ children, className }: ReadNoteProps) {
  // A live region says what changes in it, not what it is born with (WAI-ARIA: `status` is polite, only `alert` is
  // read at birth). The note is mounted empty and takes its words a moment later, so the first words are heard too;
  // every caller mounts it with its words already there (Codex on #229).
  const [said, setSaid] = useState<ReactNode>(null)
  useEffect(() => {
    setSaid(children)
  }, [children])
  return (
    <p className={['read-note', className?.trim()].filter(Boolean).join(' ')} role="status">
      {said}
    </p>
  )
}
