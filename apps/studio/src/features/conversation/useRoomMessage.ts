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
export interface RoomMessage {
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

/**
 * What follows a send (chat-pace.md): recorded; refused, back to an empty bar, or onto a row of its own; with no reply,
 * nothing yet (its row offers it again). A row's own Try again refused keeps its row: the row holds the whole message,
 * its reply and mentions too, which the bar can't take back. A row's message goes from its row once it is recorded.
 */
export function afterSend(ok: boolean, refused: boolean, barEmpty: boolean, fromRow: boolean) {
  if (ok) return { goes: 'recorded', letGoRow: true } as const
  if (refused && !fromRow) return { goes: barEmpty ? 'bar' : 'row', letGoRow: false } as const
  return { goes: 'nowhere', letGoRow: false } as const
}

/**
 * The message a press sends: a refused row's own (not while one goes, or one waits on its lost reply: that one goes
 * first), else the one whose reply was lost, else the bar's words; none for an empty bar.
 */
function toSend(
  again: RoomMessage | undefined,
  admission: { status: string; args?: RoomMessage },
  now: { draft: string; reply: ReplyUnderWay; mentions: MentionsUnderWay },
): RoomMessage | null {
  const unknown = admission.status === 'unknown' ? admission.args : undefined
  if (again && (unknown || admission.status === 'sending')) return null
  const message = again ?? unknown ?? { text: now.draft.trim(), replyTo: now.reply.id, mentions: now.mentions.ids }
  return message.text ? message : null
}

/** Whether the send that just ended was refused for good: read after it, as the write's catch set it. */
const wasRefused = (refused: { current: boolean }) => refused.current

/**
 * A message recorded: the reply it went as is let go (another chosen meanwhile, while it went or after no reply, stays),
 * and so are the members it named, unless the choice is no longer the one sent: that is the next message's (409 P2
 * 4304921244). The bar is left as it is: it emptied as the message went, so what it holds now is new words, even the
 * same ones.
 */
function recorded(message: RoomMessage, now: { reply: ReplyUnderWay; mentions: MentionsUnderWay }) {
  if (message.replyTo !== null && message.replyTo === now.reply.id) now.reply.done()
  if (message.mentions.length > 0 && sameMembers(now.mentions.ids, message.mentions)) now.mentions.done()
}

/** The room's message written under its key, kept in the tab until answered (held-in-tab.ts); `refused` says how. */
function useRoomWrite(projectId: string, identity: Identity, refused: { current: boolean }) {
  const queryClient = useQueryClient()
  const kept = useKeptMessage(projectId, identity)
  return useAdmission<RoomMessage, ContributionReceipt>(async (key, message) => {
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
      refused.current = err instanceof ApiError && err.retry !== 'same_admission_key'
      if (refused.current) kept.letGo(key)
      throw err
    } finally {
      void queryClient.invalidateQueries({ queryKey: snapshotKey(projectId, identity.name) })
    }
  }, kept.resumed)
}

export function useRoomMessage(
  projectId: string,
  identity: Identity,
  draft: string,
  onDraft: (text: string) => void,
  /** The entry it answers (A20) and the members it names (A37), when there are. */
  { reply = NO_REPLY, mentions = NO_MENTIONS }: { reply?: ReplyUnderWay; mentions?: MentionsUnderWay } = {},
) {
  // Whether the last send was refused for good (not merely unanswered): its words then go back to the bar.
  const refused = useRef(false)
  // Refused messages whose words the bar couldn't take back (it held others by then): each keeps a row of its own, with
  // its own reply and mentions, until its own Try again lands (chat-pace.md).
  const [failed, setFailed] = useState<readonly RoomMessage[]>([])
  const write = useRoomWrite(projectId, identity, refused)
  // The draft and the reply as they are now: read after the answer, never from the press's render.
  const latest = useRef({ draft, reply, mentions })
  useLayoutEffect(() => {
    latest.current = { draft, reply, mentions }
  })
  const unknown = write.state.status === 'unknown' ? write.state.args : null
  /**
   * Sends the draft, or `again` (a refused message, from its own row, as it first went). The message is drawn at once in
   * the discussion (chat-pace.md), so the bar empties for the next words. While one goes, Send is off and Enter sends
   * only what Send would (Composer); after no reply, a press resends that message with its own key (pressFor), never a
   * second one, and no refused row goes meanwhile. Refused, its words go back to the bar if it is empty, or keep a row:
   * they are never lost.
   */
  const send = async (again?: RoomMessage) => {
    const message = toSend(again, write.state, { draft, reply, mentions })
    if (!message) return
    refused.current = false
    if (!again && latest.current.draft.trim() === message.text) onDraft('')
    const ok = (await write.send(message)) !== undefined
    const next = afterSend(ok, wasRefused(refused), latest.current.draft.trim() === '', again !== undefined)
    // The row it came from, by the message itself: a row's Try again whose reply was lost goes again from the line
    // above the bar (`unknown`), the same message, and its row goes when that lands.
    if (next.letGoRow) setFailed((was) => was.filter((m) => m !== message))
    if (next.goes === 'recorded') recorded(message, latest.current)
    if (next.goes === 'bar') onDraft(message.text)
    if (next.goes === 'row') setFailed((was) => [...was, message])
  }
  const words = unknown
    ? `Not confirmed: “${firstWords(unknown.text)}”`
    : write.state.status === 'rejected'
      ? write.state.error.message
      : null
  return {
    state: write.state.status,
    words,
    held: unknown ? firstWords(unknown.text) : null,
    send,
    /** The admission as it stands, and the refused messages kept off the bar: the rows on their way (pendingOf). */
    admission: write.state,
    failed,
  }
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
