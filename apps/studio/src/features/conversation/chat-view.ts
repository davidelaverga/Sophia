// The typed chat's pure rules: how replies fold into turns, what the foot of the chat offers, and what its status
// line says. React only renders them.
import type { SophiaPresence } from '@sophia/contracts'
import type { ChatNotice, ChatReply } from '@sophia/contracts/room-chat'

export interface ChatTurn {
  id: string
  exchangeId: string
  text: string
  reply: string
  sequence: number
  state: 'sending' | 'responding' | 'complete' | 'refused' | 'unknown'
  reason: string | null
}

/** Duplicate/out-of-session packets cannot append another reply. No content is written to browser storage. */
export function receiveChat(turns: readonly ChatTurn[], packet: ChatReply): ChatTurn[] {
  return turns.map((t) => {
    if (t.state === 'complete' || t.state === 'refused') return t
    if (t.id !== packet.id || t.exchangeId !== packet.exchangeId || packet.sequence <= t.sequence) return t
    return {
      ...t,
      sequence: packet.sequence,
      reply: packet.kind === 'delta' ? t.reply + packet.text : t.reply,
      state: packet.kind === 'delta' || packet.kind === 'accepted' ? 'responding' : packet.kind,
      reason: packet.kind === 'refused' ? packet.text : null,
    }
  })
}

/**
 * A finished result, told in the chat to someone in text mode (SMC-M03 S6): the bridge's notice carries ids and the
 * task's kind, and the words are Studio's own. It sits after the turn that was last when it arrived.
 */
export interface ChatNoticeItem {
  key: string
  taskId: string
  taskKind: string
  resultRevision: number
  afterTurnId: string | null
}

const KEPT_NOTICES = 20

/** A notice is kept once per result revision, however often it is delivered. */
export function receiveNotice(
  notices: readonly ChatNoticeItem[],
  packet: ChatNotice,
  afterTurnId: string | null,
): ChatNoticeItem[] {
  const key = `${packet.taskId}:${String(packet.resultRevision)}`
  if (notices.some((n) => n.key === key)) return [...notices]
  const { taskId, taskKind, resultRevision } = packet
  return [...notices.slice(-(KEPT_NOTICES - 1)), { key, taskId, taskKind, resultRevision, afterTurnId }]
}

/** The notice's words, by the task's kind: never anything a report, a page or a model wrote. */
export function noticeTitle(taskKind: string): string {
  if (taskKind === 'research') return 'Research report ready'
  if (taskKind === 'draft_brief') return 'Brief ready'
  return 'Result ready'
}

interface DeliveredFile {
  format: 'markdown' | 'pdf'
  artifactVersionId: string
}

/**
 * What a result notice's buttons open and save (M03-RF-0020): Open and Download both take the primary file, the PDF
 * when there is one; Markdown is offered beside a PDF only. Each names its version, so all three show the same one.
 */
export function noticeActions<T extends DeliveredFile>(
  outputs: readonly T[],
): { primary: T | null; markdown: T | null } {
  const pdf = outputs.find((o) => o.format === 'pdf') ?? null
  const markdown = outputs.find((o) => o.format === 'markdown') ?? null
  return { primary: pdf ?? markdown, markdown: pdf ? markdown : null }
}

/**
 * What Open (and Markdown) ask the viewer for: the report, the file's own version and its format, always named (the
 * viewer's own default is the Markdown, M03-RF-0020).
 */
export function noticeOpenRequest(
  artifactId: string,
  file: DeliveredFile,
): { artifactId: string; versionId: string; format: DeliveredFile['format'] } {
  return { artifactId, versionId: file.artifactVersionId, format: file.format }
}

export type ChatEntryItem = { type: 'turn'; turn: ChatTurn } | { type: 'notice'; notice: ChatNoticeItem }

/**
 * The chat in order: each turn, then the notices that arrived after it. A notice whose turn is no longer kept (or that
 * came before any) comes first.
 */
export function chatTimeline(turns: readonly ChatTurn[], notices: readonly ChatNoticeItem[]): ChatEntryItem[] {
  const ids = new Set(turns.map((t) => t.id))
  const loose = notices.filter((n) => n.afterTurnId === null || !ids.has(n.afterTurnId))
  return [
    ...loose.map((notice) => ({ type: 'notice' as const, notice })),
    ...turns.flatMap((turn) => [
      { type: 'turn' as const, turn },
      ...notices.filter((n) => n.afterTurnId === turn.id).map((notice) => ({ type: 'notice' as const, notice })),
    ]),
  ]
}

/** What the foot of the chat offers: its one way in, or the message bar. Never both. */
export type ChatEntry = 'start' | 'bar'

/**
 * The message bar is there only while there is a conversation to type into: this person is in the room and Sophia's
 * exchange exists (open, or paused). Until then the chat offers one way in, Chat with Sophia, which joins in text
 * mode and opens the exchange. A bar that cannot send, beside a button that starts, read as two ways to do one thing.
 */
export function chatEntry(inRoom: boolean, presence: SophiaPresence | undefined): ChatEntry {
  return inRoom && !!presence && presence.exchange !== 'none' ? 'bar' : 'start'
}

/**
 * The one error the chat's foot says. Why the call ended or failed comes first: it is the room's state now, and a
 * send or a start that failed before it is old news. The chat's own errors belong to a call this person is in, so
 * they go with it. `live`: the foot announces it to screen readers; the room's note is announced by the dock, which
 * stays in the accessibility tree even where the panel covers it, so here it is said for the eye only.
 */
export function footError(
  room: string | null,
  inRoom: boolean,
  send: string | null,
  start: string | null,
): { text: string; live: boolean } | null {
  if (room) return { text: room, live: false }
  const own = inRoom ? (send ?? start) : null
  return own ? { text: own, live: true } : null
}

/** Typed words reach Sophia: her exchange is open and she is ready to take them. */
export function reachesSophia(presence: SophiaPresence | undefined): boolean {
  return presence?.exchange === 'open' && presence.voice === 'ready'
}

export interface ChatMoment {
  /** Chat with Sophia is under way. */
  starting: boolean
  /** The room connection is live, not reconnecting. */
  live: boolean
  /** This person holds the floor, so their words are the ones Sophia takes. */
  mine: boolean
  /** Sophia's replies are read, not heard. */
  textMode: boolean
}

/**
 * The line above the message bar: why Send waits, close to the room's own words for the same states, or that typing
 * reaches Sophia. Null when the bar speaks for itself. Whenever this returns a reason, Send is disabled (Composer).
 */
export function chatLine(presence: SophiaPresence, at: ChatMoment): string | null {
  if (at.starting) return 'Connecting to Sophia…'
  if (presence.exchange === 'paused')
    return presence.pauseReason === 'guest'
      ? 'Sophia is paused while a guest is here.'
      : 'Sophia is paused. Resume in the room.'
  if (!at.live) return 'Reconnecting to the room…'
  if (presence.voice === 'unavailable') return 'Sophia is unavailable right now.'
  if (presence.voice === 'recovering') return 'Reconnecting to Sophia…'
  if (presence.voice !== 'ready') return 'Sophia is joining…'
  if (!at.mine) return 'Take the floor to message Sophia.'
  return at.textMode ? 'Typing to Sophia' : null
}

/**
 * The line waits on a control in the room's dock: taking the floor, or Resume. Where the panel covers the dock the
 * chat offers to show the room, so the line never points at something out of reach.
 */
export function waitsOnRoom(presence: SophiaPresence, at: ChatMoment): boolean {
  if (at.starting) return false
  if (presence.exchange === 'paused') return presence.pauseReason !== 'guest'
  return at.live && presence.voice === 'ready' && !at.mine
}
