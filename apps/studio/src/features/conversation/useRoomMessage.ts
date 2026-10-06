// A message to the room (docs/plans/room-discussion.md): the project's discussion, attributed, recorded through the
// contributions API (A05) with one Idempotency-Key per message. It is never sent to Sophia and never starts work. The
// feed carries it to every member's chat; this page reads the snapshot again at once.
import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ContributionReceipt } from '@sophia/contracts'
import { submitContribution } from '../../api/conversation.ts'
import { useAdmission } from '../../api/useAdmission.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { barTarget, type Target } from './discussion-view.ts'

/** A message's first words, for the line that says which one wasn't confirmed. */
const firstWords = (text: string) => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text)

/** A message to the room, and the entry of the discussion it answers (A20, the vision flag's), if any. */
interface RoomMessage {
  text: string
  replyTo: string | null
}

/** The reply under way: the entry answered (or none), and what to do once the reply is recorded. */
export interface ReplyUnderWay {
  id: string | null
  done: () => void
}

const NO_REPLY: ReplyUnderWay = { id: null, done: () => undefined }

export function useRoomMessage(
  projectId: string,
  identity: Identity,
  draft: string,
  onDraft: (text: string) => void,
  reply: ReplyUnderWay = NO_REPLY,
) {
  const queryClient = useQueryClient()
  const write = useAdmission<RoomMessage, ContributionReceipt>(async (key, message) => {
    try {
      return await submitContribution(identity.token, projectId, key, {
        source: null,
        text: message.text,
        threadId: message.replyTo,
        artifactVersionId: null,
        intent: 'discuss',
      })
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  })
  // The draft as it is now: read after the answer, never from the press's render.
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  })
  const unknown = write.state.status === 'unknown' ? write.state.args : null
  /**
   * Sends the draft. While one goes, Send is off and Enter sends only what Send would (Composer); after no reply, a
   * press resends that message with its own key (pressFor), never a second one. Recorded, the bar clears only if it
   * still holds what was sent: words written meanwhile stay.
   */
  const send = async () => {
    const message = unknown ?? { text: draft.trim(), replyTo: reply.id }
    if (!message.text || !(await write.send(message))) return
    if (message.replyTo) reply.done()
    if (latest.current.trim() === message.text) onDraft('')
  }
  const words = unknown
    ? `Not sent to the room: “${firstWords(unknown.text)}”`
    : write.state.status === 'rejected'
      ? write.state.error.message
      : null
  return { state: write.state.status, words, send }
}

/**
 * Who the bar writes to (discussion-view.ts). The target is fixed once something is written, or when the person
 * switches; an emptied bar follows Sophia's availability again, unless the person chose.
 */
export function useBarTarget(sophiaReady: boolean, draft: string, field: RefObject<HTMLTextAreaElement | null>) {
  const [chosen, setChosen] = useState<{ target: Target; by: 'written' | 'switched' } | null>(null)
  const [wasReady, setWasReady] = useState(sophiaReady)
  const bar = barTarget(chosen?.target ?? null, sophiaReady)
  const written = draft.trim() !== ''
  if (written && !chosen) setChosen({ target: bar.target, by: 'written' })
  // An empty bar keeps only what the person switched to, and only while it is offered: nothing is held with nothing in
  // it, and when Sophia can take messages again (a new conversation), it starts on her as it always does.
  const back = sophiaReady && !wasReady
  if (sophiaReady !== wasReady) setWasReady(sophiaReady)
  if (!written && chosen && (chosen.by === 'written' || bar.held || back)) setChosen(null)
  const choose = (target: Target) => setChosen({ target, by: 'switched' })
  return {
    ...bar,
    choose,
    /** A held message moved to the room: the pressed link goes with the line, the focus goes back to the bar. */
    moveToRoom: () => {
      choose('room')
      field.current?.focus({ preventScroll: true })
    },
  }
}
