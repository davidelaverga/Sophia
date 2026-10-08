// Sophia's conversation in the room, answered as the API answers it (contract amendment A06, `start_exchange` and
// `control_exchange` in db/migrations/0013; docs/plans/room-honest.md): asking her in opens it, unless a guest is in
// the room; Stop speaking quiets her; Show and Stop looking move what she sees; Resume lifts a pause the room allows;
// End ends it, and ends an ended one again harmlessly. The page says what she does next (`onExchange`), as her bridge
// would. Every id here is synthetic.
import type { ExchangeReceipt, ExchangeState } from '@sophia/contracts'
import { EXCHANGE, membership, ROOM, type RoomAsked } from './data.ts'

/** What a press asks of her conversation, as the page's bridge hears it. */
export type ExchangeAction = 'start' | 'stop-speaking' | 'end' | 'resume'

/** The part of the fixture's project her conversation reads and moves. */
export interface ExchangeHost {
  revision: number
  exchange: boolean
  room?: RoomAsked
  /** Her conversation moved; absent, a press on it is unexpected. */
  onExchange?: (action: ExchangeAction) => void
  /** A guest is among the people in the room (the LiveKit server's list the API reads). */
  guestHere?: () => boolean
}

const CONTROLS = ['stop-speaking', 'end', 'resume', 'look', 'stop-looking'] as const
type Control = (typeof CONTROLS)[number]

/** Asking her in, by its Idempotency-Key: the same key again replays the receipt, as the API does. */
const started = new Map<string, ExchangeReceipt>()

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A refusal in the API's words (persistence/errors.ts maps the database's). */
const refused = (code: 'stale_revision' | 'invalid_state', message: string) =>
  json({ code, message, requestId: '00000000-0000-4000-8000-0000000000be', retry: 'never' }, 409)

const GUEST = 'A guest is in the room: Sophia joins when the room is member-only'

function bodyOf(init: RequestInit | undefined): Record<string, unknown> {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  return typeof body === 'object' && body !== null ? { ...body } : {}
}

function stateOf(host: ExchangeHost): ExchangeState {
  const room = host.room ?? {}
  return {
    exchangeId: EXCHANGE,
    roomId: ROOM,
    state: !host.exchange ? 'ended' : room.pauseReason ? 'paused' : 'open',
    pauseReason: host.exchange ? (room.pauseReason ?? null) : null,
    inputEpoch: room.inputEpoch ?? 1,
    playbackEpoch: 1,
    observationEpoch: 1,
    revision: host.revision,
  }
}

function start(host: ExchangeHost, init: RequestInit | undefined, publish: () => void): Response {
  // The route asks the LiveKit server about guests before the database sees the request (routes/exchanges.ts).
  if (host.guestHere?.()) return refused('invalid_state', GUEST)
  const key = new Headers(init?.headers).get('idempotency-key') ?? ''
  const replay = started.get(key)
  if (replay) return json(replay, 201)
  const body = bodyOf(init)
  if (body.expectedRoomRevision !== host.revision) return refused('stale_revision', 'Stale room revision')
  if (host.exchange) return refused('invalid_state', 'Sophia is already in this conversation')
  if (host.room) host.room.allowVision = body.allowVision === true
  host.onExchange?.('start')
  publish()
  const receipt: ExchangeReceipt = {
    exchangeId: EXCHANGE,
    roomId: ROOM,
    revision: host.revision,
    inputActorId: host.room?.holder ?? membership.actorId,
  }
  started.set(key, receipt)
  return json(receipt, 201)
}

/** Why she can't be shown `source` now, in the API's words; null when she can. */
function lookRefusal(room: RoomAsked, source: unknown): string | null {
  if (!room.allowVision) return 'Vision is off for this exchange'
  if (source !== 'screen' && source !== 'camera') return 'Invalid source'
  return room.pauseReason ? 'The exchange is paused' : null
}

/** Why `what` can't be done now, in the API's words; null when it can. */
function refusalOf(host: ExchangeHost, what: Control, source: unknown): string | null {
  if (!host.exchange) return what === 'end' ? null : 'The exchange has ended'
  const room = host.room ?? {}
  if (what === 'resume' && room.pauseReason === 'guest' && host.guestHere?.()) {
    return 'Sophia resumes only when the room is member-only again'
  }
  return what === 'look' ? lookRefusal(room, source) : null
}

/** What she sees moves: shown a source, or no longer looking (she looked, so vision stays allowed, as `allow_vision`). */
function moveSight(room: RoomAsked, what: 'look' | 'stop-looking', source: unknown): void {
  if (what === 'stop-looking') {
    room.allowVision ??= !!room.looking
    room.looking = null
  } else if (source === 'screen' || source === 'camera') {
    room.looking = { participantIdentity: membership.actorId, source }
  }
}

function controlled(host: ExchangeHost, what: Control, init: RequestInit | undefined, publish: () => void): Response {
  const source = bodyOf(init).source
  const refusal = refusalOf(host, what, source)
  if (refusal) return refused('invalid_state', refusal)
  // Ending an ended conversation again, or resuming one not paused, answers what it is and changes nothing.
  if (!host.exchange || (what === 'resume' && !host.room?.pauseReason)) return json(stateOf(host))
  if (what === 'look' || what === 'stop-looking') {
    if (host.room) moveSight(host.room, what, source)
  } else {
    host.onExchange?.(what)
  }
  publish()
  return json(stateOf(host))
}

/**
 * A write to her conversation, or null when `path` is none: `publish` moves the project a revision and tells every
 * open stream, as the API's event does.
 */
export function exchangeWritten(
  host: ExchangeHost,
  path: string,
  init: RequestInit | undefined,
  publish: () => void,
): Response | null {
  if (!host.onExchange) return null
  if (path === `/api/v1/rooms/${ROOM}/exchanges`) return start(host, init, publish)
  const what = CONTROLS.find((c) => path === `/api/v1/exchanges/${EXCHANGE}/${c}`)
  return what ? controlled(host, what, init, publish) : null
}
