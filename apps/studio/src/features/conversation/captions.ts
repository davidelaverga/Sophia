// Live captions in the chat (CX-0023): what is said aloud, the floor holder's words and Sophia's spoken reply, as the
// bridge passes them on. Pure: how fragments fold into captions, in order, once each. Captions live in memory for the
// page only, never in browser storage, and a typed request is never made of them.
import type { ChatCaption } from '@sophia/contracts/room-chat'

export interface CaptionTurn {
  id: string
  exchangeId: string
  speaker: ChatCaption['speaker']
  actorId: string | null
  /** Its fragments, by sequence: one delivered again or late takes its own place, once. */
  parts: readonly { sequence: number; text: string }[]
  /** Partial while it is being said; final or interrupted (cut off) once it ended, which it never takes back. */
  state: ChatCaption['state']
  /** The sequence its end came with: nothing after it belongs to it. */
  end: number | null
  /** Its place in the chat: the arrival count of its first fragment (chat-view.ts), or just before the one it precedes. */
  at: number
}

/** As much as the chat keeps: a long call's oldest captions go, and a caption past this many characters stops growing. */
const KEPT = 100
const MAX_CHARS = 4000

function opened(turns: CaptionTurn[], p: ChatCaption, at: number): CaptionTurn[] {
  // An end whose words never reached this page has nothing to show.
  if (p.state !== 'partial' && !p.text) return turns
  const next = turns.find((t) => t.id === p.before && t.exchangeId === p.exchangeId)
  const turn: CaptionTurn = {
    id: p.id,
    exchangeId: p.exchangeId,
    speaker: p.speaker,
    actorId: p.actorId,
    parts: [{ sequence: p.sequence, text: p.text }],
    state: p.state,
    end: p.state === 'partial' ? null : p.sequence,
    at: next ? next.at - 0.5 : at,
  }
  return [...turns.slice(-(KEPT - 1)), turn]
}

function extended(t: CaptionTurn, p: ChatCaption): CaptionTurn {
  const repeat = p.sequence === t.end || t.parts.some((part) => part.sequence === p.sequence)
  if (repeat || (t.end !== null && (p.sequence > t.end || p.state !== 'partial'))) return t
  const length = t.parts.reduce((n, part) => n + part.text.length, 0)
  const parts =
    p.text && length + p.text.length <= MAX_CHARS
      ? [...t.parts, { sequence: p.sequence, text: p.text }].toSorted((a, b) => a.sequence - b.sequence)
      : t.parts
  const ends = p.state !== 'partial'
  if (parts === t.parts && !ends) return t
  return { ...t, parts, ...(ends ? { state: p.state, end: p.sequence } : {}) }
}

/**
 * One caption packet into the chat's captions. `at` is the arrival count it came at. A repeat, a fragment after its
 * caption's end, or one of another exchange under a known id changes nothing: the same list comes back.
 */
export function receiveCaption(turns: CaptionTurn[], packet: ChatCaption, at: number): CaptionTurn[] {
  const held = turns.find((t) => t.id === packet.id)
  if (!held) return opened(turns, packet, at)
  if (held.exchangeId !== packet.exchangeId || held.speaker !== packet.speaker) return turns
  const next = extended(held, packet)
  return next === held ? turns : turns.map((t) => (t === held ? next : t))
}

/** Its words in order; where fragments never arrived, an ellipsis says something is missing. */
export function captionText(turn: CaptionTurn): string {
  let text = ''
  let expected = 1
  for (const part of turn.parts) {
    if (part.sequence > expected) text += ' … '
    text += part.text
    expected = part.sequence + 1
  }
  if (turn.end !== null && turn.end > expected) text += ' …'
  return text.trim()
}

/** The call ended: what was still being said is cut off. The same list when nothing was. */
export function closeCaptions(turns: CaptionTurn[]): CaptionTurn[] {
  if (!turns.some((t) => t.state === 'partial')) return turns
  return turns.map((t) => (t.state === 'partial' ? { ...t, state: 'interrupted' } : t))
}
