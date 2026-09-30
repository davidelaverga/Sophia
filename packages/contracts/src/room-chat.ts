/** Ephemeral typed conversation transport. Identity comes from the signed participant, never the payload.
 * No voice transcript enters this channel. Durable notes use the canonical mission tools separately.
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
export type ChatPacket = ChatInput | ChatReply
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

function packet(p: Record<string, unknown>): ChatPacket | null {
  const fields = base(p)
  if (!fields) return null
  if (p.kind === 'input')
    return whole(p.inputEpoch, 1) && fields.text.trim() ? { ...fields, kind: 'input', inputEpoch: p.inputEpoch } : null
  if (p.kind !== 'accepted' && p.kind !== 'delta' && p.kind !== 'complete' && p.kind !== 'refused') return null
  return whole(p.sequence) ? { ...fields, kind: p.kind, sequence: p.sequence } : null
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
