// Replying in the room's chat (docs/plans/room-chat-replies.md, A20 proposed, the vision flag's): above the message
// bar, what the message answers, with ✕ to stop. A reply is the room's: the bar moves to the room and the field takes
// the focus; Escape in the field, or ✕, stops replying and keeps the words.
import { useEffect, useRef, type RefObject } from 'react'
import { Icon } from '@sophia/ui'
import type { Target } from './discussion-view.ts'

/** The message being answered: its entry, who wrote it, and its first words. */
export interface Replying {
  id: string
  author: string
  quote: string
}

/** While replying: the bar writes to the room, the field has the focus, and Escape in it stops replying. */
export function useReplyBar(
  replying: Replying | null,
  bar: { target: Target; choose: (target: Target) => void },
  field: RefObject<HTMLTextAreaElement | null>,
  onStop: () => void,
) {
  const id = replying?.id ?? null
  const { choose, target } = bar
  const latest = useRef({ choose, onStop })
  useEffect(() => {
    latest.current = { choose, onStop }
  })
  // A reply is the room's: should the bar go to Sophia meanwhile (its switch, or Sophia ready again), it stops.
  const was = useRef(target)
  useEffect(() => {
    if (id !== null && was.current === 'room' && target !== 'room') latest.current.onStop()
    was.current = target
  }, [id, target])
  useEffect(() => {
    if (id === null) return
    latest.current.choose('room')
    field.current?.focus()
  }, [id, field])
  useEffect(() => {
    const el = field.current
    if (id === null || !el) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return
      // The reply goes, not the panel: Escape is spent here.
      e.preventDefault()
      e.stopPropagation()
      latest.current.onStop()
    }
    el.addEventListener('keydown', onKey)
    return () => el.removeEventListener('keydown', onKey)
  }, [id, field])
}

export function ReplyingTo({ replying, onStop }: { replying: Replying | null; onStop: () => void }) {
  if (!replying) return null
  return (
    <p className="replying" role="status" aria-label="Replying">
      <span className="replying-words">{`Replying to ${replying.author}: “${replying.quote}”`}</span>
      <button type="button" className="round" aria-label="Stop replying" onClick={onStop}>
        <Icon name="close" />
      </button>
    </p>
  )
}
