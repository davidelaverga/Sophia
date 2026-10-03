/** Ephemeral conversation transport. Identity comes from the signed participant, never the payload. Durable notes use
 * the canonical mission tools separately; nothing on this channel is stored or logged, by either side.
 *
 * SMC-M03 S6 adds two kinds, each ignored by a side that does not know it (an older parser returns null):
 * - `mode` (Studio → bridge, input topic): whether this person reads Sophia (text mode) or hears her. It is a packet,
 *   not a participant attribute: members cannot update their own LiveKit metadata or attributes, and granting that
 *   would let them rewrite their signed standing. Studio says it on every join, reconnect and switch, which is also
 *   the bridge's cue to send that member the cards the exchange has shown (CX-0022).
 * - `notice` (bridge → Studio, reply topic): a finished result's card, for every member present, whether they hear
 *   Sophia say it or read her (CX-0022); sent again when their Studio says its mode, so the receiver keeps one per task
 *   (its newest revision) and ignores the repeats. A fixed template of ids and a bounded kind name, never text: Studio
 *   words it, and a report's own title or anything a web page said never travels in it.
 *
 * CX-0023 adds a third, `caption` (bridge → Studio, reply topic): live on-screen captions of what is said aloud, the
 * floor holder's words (Google transcribes only the holder's forwarded audio) and Sophia's spoken reply, sent as they
 * arrive to the members present (never a guest). Who spoke comes from the bridge's floor, never from Google or the
 * payload. The bridge keeps no text past the fragment it passes on; Studio keeps captions in memory for the page only.
 * They are display, never note provenance, and a typed request is never made of them.
 */
export const CHAT_INPUT_TOPIC = 'sophia.chat.input.v1'
export const CHAT_REPLY_TOPIC = 'sophia.chat.reply.v1'
export type ChatInput = { kind: 'input'; id: string; exchangeId: string; inputEpoch: number; text: string }
export type ChatReply = {
  kind: 'accepted' | 'delta' | 'complete' | 'refused'
  id: string
  exchangeId: string
  sequence: number
  text: string
}
export type ChatMode = { kind: 'mode'; textMode: boolean }
export type ChatNotice = {
  kind: 'notice'
  id: string
  exchangeId: string
  taskId: string
  /** The task's kind (A11's bounded kind name): Studio words the notice by it. */
  taskKind: string
  resultRevision: number
}
/**
 * One fragment of a caption, or its end. `sequence` counts every packet of the caption from 1, also those that never
 * reached this member (a gap shows); `final` or `interrupted` ends it, with the last words or none.
 */
export type ChatCaption = {
  kind: 'caption'
  id: string
  exchangeId: string
  speaker: 'member' | 'sophia'
  /** Whose words: the floor holder the bridge forwarded them for. Null for Sophia. */
  actorId: string | null
  sequence: number
  state: 'partial' | 'final' | 'interrupted'
  /** At most 2000 characters; empty only on an end marker. */
  text: string
  /** The caption this one goes before: the holder's words, transcribed after Sophia's reply to them had begun. */
  before?: string
}
/** The most a caption packet's JSON takes, in bytes: under the 12000 every packet is read with, whatever its text. */
export const CAPTION_PACKET_BYTES = 9000
export type ChatPacket = ChatInput | ChatMode | ChatReply | ChatNotice | ChatCaption
const KIND_NAME = /^[a-z][a-z0-9_]{0,39}$/
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const whole = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min
const record = (p: unknown): p is Record<string, unknown> => typeof p === 'object' && p !== null && !Array.isArray(p)

function base(p: Record<string, unknown>): { id: string; exchangeId: string; text: string } | null {
  if (
    typeof p.id !== 'string' ||
    !uuid.test(p.id) ||
    typeof p.exchangeId !== 'string' ||
    !uuid.test(p.exchangeId) ||
    typeof p.text !== 'string' ||
    p.text.length > 2000
  )
    return null
  return { id: p.id, exchangeId: p.exchangeId, text: p.text }
}

function notice(p: Record<string, unknown>): ChatNotice | null {
  const { id, exchangeId, taskId, taskKind, resultRevision } = p
  const ids = [id, exchangeId, taskId].every((v) => typeof v === 'string' && uuid.test(v))
  if (!ids || typeof taskKind !== 'string' || !KIND_NAME.test(taskKind) || !whole(resultRevision, 1)) return null
  return {
    kind: 'notice',
    id: String(id),
    exchangeId: String(exchangeId),
    taskId: String(taskId),
    taskKind,
    resultRevision,
  }
}

const mode = (p: Record<string, unknown>): ChatMode | null =>
  typeof p.textMode === 'boolean' ? { kind: 'mode', textMode: p.textMode } : null

type Fields = { id: string; exchangeId: string; text: string }

const input = (p: Record<string, unknown>, fields: Fields): ChatInput | null =>
  whole(p.inputEpoch, 1) && fields.text.trim() ? { ...fields, kind: 'input', inputEpoch: p.inputEpoch } : null

function reply(p: Record<string, unknown>, fields: Fields): ChatReply | null {
  if (p.kind !== 'accepted' && p.kind !== 'delta' && p.kind !== 'complete' && p.kind !== 'refused') return null
  return whole(p.sequence) ? { ...fields, kind: p.kind, sequence: p.sequence } : null
}

const captionState = (s: unknown): s is ChatCaption['state'] => s === 'partial' || s === 'final' || s === 'interrupted'

/** A member's words name the member; Sophia's name nobody. */
function captionWho(p: Record<string, unknown>): Pick<ChatCaption, 'speaker' | 'actorId'> | null {
  if (p.speaker === 'sophia' && p.actorId === null) return { speaker: 'sophia', actorId: null }
  if (p.speaker === 'member' && typeof p.actorId === 'string' && uuid.test(p.actorId))
    return { speaker: 'member', actorId: p.actorId }
  return null
}

function caption(p: Record<string, unknown>, fields: Fields): ChatCaption | null {
  const who = captionWho(p)
  const { sequence, state, before } = p
  if (!who || !whole(sequence, 1) || !captionState(state)) return null
  if (state === 'partial' && !fields.text) return null
  if (before !== undefined && (typeof before !== 'string' || !uuid.test(before))) return null
  return { ...fields, kind: 'caption', ...who, sequence, state, ...(before === undefined ? {} : { before }) }
}

function packet(p: Record<string, unknown>): ChatPacket | null {
  if (p.kind === 'mode') return mode(p)
  if (p.kind === 'notice') return notice(p)
  const fields = base(p)
  if (!fields) return null
  if (p.kind === 'caption') return caption(p, fields)
  return p.kind === 'input' ? input(p, fields) : reply(p, fields)
}

export function parseChatPacket(bytes: Uint8Array): ChatPacket | null {
  if (bytes.byteLength > 12000) return null
  let p: unknown
  try {
    p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return null
  }
  return record(p) ? packet(p) : null
}
export const encodeChatPacket = (p: ChatPacket): Uint8Array<ArrayBuffer> => new TextEncoder().encode(JSON.stringify(p))
