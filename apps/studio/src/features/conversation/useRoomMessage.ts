// A message to the room (docs/plans/room-discussion.md): the project's discussion, attributed, recorded through the
// contributions API (A05) with one Idempotency-Key per message. It is never sent to Sophia and never starts work. The
// feed carries it to every member's chat; this page reads the snapshot again at once. On its way or sent with no reply,
// it is kept in the tab (held-in-tab.ts), so a reload offers it again under its key (reliability-held-on-reload.md).
import { useQueryClient } from '@tanstack/react-query'
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { ContributionReceipt } from '@sophia/contracts'
import { ApiError } from '../../api/client.ts'
import { submitContribution } from '../../api/conversation.ts'
import { useAdmission, type Resumed } from '../../api/useAdmission.ts'
import { accountOf } from '../../app/auth-callback.ts'
import type { Identity } from '../../app/dev-identity.ts'
import { keepHeld, readHeld, type HeldAt } from '../../app/held-in-tab.ts'
import { snapshotKey } from '../studio/useProjectFeed.ts'
import { barTarget, type Target } from './discussion-view.ts'
import type { MentionsUnderWay } from './MentionPicker.tsx'

/** A message's first words, for the line that says which one wasn't confirmed. */
const firstWords = (text: string) => (text.length > 48 ? `${text.slice(0, 47).trimEnd()}…` : text)

/** A message to the room, and the entry of the discussion it answers (A20, the vision flag's), if any. */
interface RoomMessage {
  text: string
  replyTo: string | null
  /** The members it names (A37); none leaves `mentions` out of the request, as before. */
  mentions: readonly string[]
}

/** The reply under way: the entry answered (or none), and what to do once the reply is recorded. */
export interface ReplyUnderWay {
  id: string | null
  done: () => void
}

/** The same members, in any order: a choice is its members, never the array that holds them. */
const sameMembers = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id) => b.includes(id))

const NO_REPLY: ReplyUnderWay = { id: null, done: () => undefined }
const NO_MENTIONS: MentionsUnderWay = { ids: [], done: () => undefined }

/** The members a kept message named (A37), read back; anything else names none. */
const namedIn = (value: unknown): readonly string[] =>
  Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : []

/**
 * The message the tab kept with no reply, read back (a reload): its key, its words, the entry it answers and the
 * members it names, so it goes again as it first went.
 */
function resumedFrom(value: unknown): Resumed<RoomMessage> | null {
  if (typeof value !== 'object' || value === null) return null
  const key: unknown = Reflect.get(value, 'key')
  const text: unknown = Reflect.get(value, 'text')
  const replyTo: unknown = Reflect.get(value, 'replyTo')
  if (typeof key !== 'string' || !key || typeof text !== 'string' || !text) return null
  const mentions = namedIn(Reflect.get(value, 'mentions'))
  return { key, args: { text, replyTo: typeof replyTo === 'string' ? replyTo : null, mentions } }
}

/**
 * The tab's place for this account's message to the project's room: what it kept, read back once as the bar opens, and
 * how to keep one before it is sent and let it go once answered (only that one: a newer kept since stays).
 */
function useKeptMessage(projectId: string, identity: Identity) {
  const at: HeldAt = { account: accountOf(identity), part: 'room', project: projectId }
  const [resumed] = useState(() => resumedFrom(readHeld(at)))
  return {
    resumed,
    keep: (key: string, message: RoomMessage) => keepHeld(at, { key, ...message }),
    letGo: (key: string) => {
      if (resumedFrom(readHeld(at))?.key === key) keepHeld(at, null)
    },
  }
}

export function useRoomMessage(
  projectId: string,
  identity: Identity,
  draft: string,
  onDraft: (text: string) => void,
  /** The entry it answers (A20) and the members it names (A37), when there are. */
  { reply = NO_REPLY, mentions = NO_MENTIONS }: { reply?: ReplyUnderWay; mentions?: MentionsUnderWay } = {},
) {
  const queryClient = useQueryClient()
  const kept = useKeptMessage(projectId, identity)
  const write = useAdmission<RoomMessage, ContributionReceipt>(async (key, message) => {
    // Kept before it goes: a page that goes, or reloads, before the reply finds it.
    kept.keep(key, message)
    try {
      const receipt = await submitContribution(identity.token, projectId, key, {
        source: null,
        text: message.text,
        threadId: message.replyTo,
        artifactVersionId: null,
        intent: 'discuss',
        ...(message.mentions.length > 0 ? { mentions: [...message.mentions] } : {}),
      })
      kept.letGo(key)
      return receipt
    } catch (err: unknown) {
      // Refused for good, it is let go; with no reply, kept (useAdmission reads anything but an ApiError as none).
      if (err instanceof ApiError && err.retry !== 'same_admission_key') kept.letGo(key)
      throw err
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  }, kept.resumed)
  // The draft and the reply as they are now: read after the answer, never from the press's render.
  const latest = useRef({ draft, reply, mentions })
  useLayoutEffect(() => {
    latest.current = { draft, reply, mentions }
  })
  const unknown = write.state.status === 'unknown' ? write.state.args : null
  /**
   * Sends the draft. While one goes, Send is off and Enter sends only what Send would (Composer); after no reply, a
   * press resends that message with its own key (pressFor), never a second one. Recorded, the bar clears only if it
   * still holds what was sent: words written meanwhile stay.
   */
  const send = async () => {
    const message = unknown ?? { text: draft.trim(), replyTo: reply.id, mentions: mentions.ids }
    if (!message.text || !(await write.send(message))) return
    // The reply sent is let go; another chosen meanwhile (while it went, or a message re-sent after no reply) stays.
    const now = latest.current.reply
    if (message.replyTo !== null && message.replyTo === now.id) now.done()
    if (latest.current.draft.trim() === message.text) onDraft('')
    // The members it named were named: the choice clears for the next message, unless it is no longer the one sent
    // (another chosen while it went, or after no reply): that is the next message's (409 P2 4304921244).
    const named = latest.current.mentions
    if (message.mentions.length > 0 && sameMembers(named.ids, message.mentions)) named.done()
  }
  const words = unknown
    ? `Not confirmed: “${firstWords(unknown.text)}”`
    : write.state.status === 'rejected'
      ? write.state.error.message
      : null
  return { state: write.state.status, words, held: unknown ? firstWords(unknown.text) : null, send }
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
