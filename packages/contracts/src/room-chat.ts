/** Ephemeral typed conversation transport. Identity comes from the signed participant, never the payload.
 * No voice transcript enters this channel. Durable notes use the canonical mission tools separately.
 *
 * SMC-M03 S6 adds two kinds, each ignored by a side that does not know it (an older parser returns null):
 * - `mode` (Studio → bridge, input topic): whether this person reads Sophia (text mode) or hears her. It is a packet,
 *   not a participant attribute: members cannot update their own LiveKit metadata or attributes, and granting that
 *   would let them rewrite their signed standing.
 * - `notice` (bridge → Studio, reply topic): a finished result, for a person in text mode, who does not hear Sophia
 *   say it. A fixed template of ids and a bounded kind name, never text: Studio words it, and a report's own title or
 *   anything a web page said never travels in it.
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
export type ChatPacket = ChatInput | ChatMode | ChatReply | ChatNotice
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

function packet(p: Record<string, unknown>): ChatPacket | null {
  if (p.kind === 'mode') return mode(p)
  if (p.kind === 'notice') return notice(p)
  const fields = base(p)
  if (!fields) return null
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
