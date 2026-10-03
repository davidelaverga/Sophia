// Live captions (CX-0023): what is said aloud, the floor holder's words and Sophia's spoken reply, passed on to the
// members present as Google transcribes them. Pass-through: each fragment is sent and forgotten. This keeps ids, whose
// words, sequence numbers and output generations, never text, so the bridge's transcript buffer stays 0 (T10). Who
// spoke comes from the floor (ExchangeState's attribution), never from Google. RoomSession decides whether a fragment
// may be captioned at all; this decides which caption it belongs to and when a caption ends.
import { randomUUID } from 'node:crypto'
import { CAPTION_PACKET_BYTES, encodeChatPacket, type ChatCaption } from '@sophia/contracts/room-chat'
import type { ReplyEnd } from './audio.ts'
import type { Attribution } from './exchange-state.ts'

interface Open {
  id: string
  /** The last packet's sequence: every packet counts, also one the session could not deliver. */
  sequence: number
  before?: string
}
interface Heard extends Open {
  actorId: string
  inputEpoch: number
}
interface Spoken extends Open {
  generation: number
  /** Google has not finished the model turn it belongs to. */
  generating: boolean
}

/** The parser's limit on a fragment's characters (room-chat.ts). */
const MAX_CHARS = 2000
/** Room for the sequence number to grow past the one the overhead was measured with. */
const SEQUENCE_ROOM = 16

/**
 * A fragment cut into pieces whose packets fit CAPTION_PACKET_BYTES, measured as JSON writes them (a control character
 * takes six bytes, an emoji four), and the parser's 2000 characters. Cut between code points, never inside one.
 */
export function captionPieces(text: string, overhead: number): string[] {
  const budget = CAPTION_PACKET_BYTES - overhead - SEQUENCE_ROOM
  const pieces: string[] = []
  let piece = ''
  let bytes = 0
  for (const point of text) {
    const size = Buffer.byteLength(JSON.stringify(point)) - 2
    if (piece && (bytes + size > budget || piece.length + point.length > MAX_CHARS)) {
      pieces.push(piece)
      piece = ''
      bytes = 0
    }
    piece += point
    bytes += size
  }
  return piece ? [...pieces, piece] : pieces
}

export class Captions {
  private readonly exchangeId: string
  private readonly send: (packet: ChatCaption) => void
  /** The holder's words being captioned now. */
  private member: Heard | null = null
  /** Sophia's replies being captioned: at most one still generating, and those that may still be playing. */
  private sophia: Spoken[] = []
  /** A caption of the holder's words opened in this model turn. */
  private memberThisTurn = false

  constructor(exchangeId: string, send: (packet: ChatCaption) => void) {
    this.exchangeId = exchangeId
    this.send = send
  }

  /**
   * The holder's words. Another holder or epoch ends the open caption and opens one for them. Words that open one while
   * Sophia's reply in this model turn is already being captioned go before it: Google sends no order between the two.
   */
  heard(text: string, who: Attribution, finished: boolean): void {
    if (!text && !finished) return
    const open = this.member
    if (open && (open.actorId !== who.actorId || open.inputEpoch !== who.inputEpoch)) this.endMember('final')
    const member = this.member ?? (text.trim() ? this.openMember(who) : null)
    if (!member) return
    this.emit(member, { speaker: 'member', actorId: member.actorId }, finished ? 'final' : 'partial', text)
    if (finished) this.member = null
  }

  private openMember(who: Attribution): Heard {
    const before = this.memberThisTurn ? undefined : this.sophia.find((s) => s.generating)?.id
    const id = randomUUID()
    this.member = { id, sequence: 0, actorId: who.actorId, inputEpoch: who.inputEpoch, ...(before ? { before } : {}) }
    this.memberThisTurn = true
    return this.member
  }

  /** Sophia's words, of the output generation they arrived in: a newer generation is a new reply. */
  spoken(text: string, generation: number): void {
    if (!text) return
    let open = this.sophia.find((s) => s.generating)
    if (open && open.generation !== generation) {
      this.endSophia(open, 'interrupted')
      open = undefined
    }
    if (!open) {
      if (!text.trim()) return
      open = { id: randomUUID(), sequence: 0, generation, generating: true }
      this.sophia.push(open)
    }
    this.emit(open, { speaker: 'sophia', actorId: null }, 'partial', text)
  }

  /** Google finished the model turn: what it said is all there is; it ends once it has played. */
  generated(): void {
    for (const s of this.sophia) s.generating = false
  }

  /** Her reply played to its end, or was cut off (stopped, interrupted, recovered, closed). */
  replyEnded(how: ReplyEnd): void {
    for (const s of this.sophia) {
      if (how !== 'played') this.endSophia(s, 'interrupted')
      else if (!s.generating) this.endSophia(s, 'final')
    }
  }

  /** The model turn ended; one the connection lost cuts off whatever was still being said. */
  turnEnded(lost: boolean): void {
    if (this.member) this.endMember(lost ? 'interrupted' : 'final')
    if (lost) for (const s of this.sophia.filter((open) => open.generating)) this.endSophia(s, 'interrupted')
    this.memberThisTurn = false
  }

  /** Paused, or closing: every open caption is cut off. */
  cut(): void {
    if (this.member) this.endMember('interrupted')
    this.replyEnded('closed')
    this.memberThisTurn = false
  }

  private endMember(state: 'final' | 'interrupted'): void {
    const member = this.member
    if (!member) return
    this.member = null
    this.emit(member, { speaker: 'member', actorId: member.actorId }, state, '')
  }

  private endSophia(open: Spoken, state: 'final' | 'interrupted'): void {
    this.sophia = this.sophia.filter((s) => s !== open)
    this.emit(open, { speaker: 'sophia', actorId: null }, state, '')
  }

  /** One packet per piece; the last carries the state. An end with no words is one packet with none. */
  private emit(open: Open, who: Pick<ChatCaption, 'speaker' | 'actorId'>, state: ChatCaption['state'], text: string) {
    const base = {
      kind: 'caption' as const,
      id: open.id,
      exchangeId: this.exchangeId,
      ...who,
      ...(open.before ? { before: open.before } : {}),
    }
    const overhead = encodeChatPacket({ ...base, sequence: open.sequence, state, text: '' }).byteLength
    const pieces = text ? captionPieces(text, overhead) : ['']
    pieces.forEach((piece, i) => {
      open.sequence += 1
      this.send({ ...base, sequence: open.sequence, state: i === pieces.length - 1 ? state : 'partial', text: piece })
    })
  }
}
