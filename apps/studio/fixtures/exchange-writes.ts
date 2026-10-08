// Sophia's conversation in the room, answered as the API answers it (contract amendment A06; docs/plans/room-honest.md):
// asking her in opens it, Stop speaking quiets her, End ends it, Resume lifts a pause. The page says what she does
// next (`onExchange`), as her bridge would. Every id here is synthetic.
import type { ExchangeReceipt, ExchangeState } from '@sophia/contracts'
import { EXCHANGE, membership, ROOM, type RoomAsked } from './data.ts'

/** What a press asks of her conversation. */
export type ExchangeAction = 'start' | 'stop-speaking' | 'end' | 'resume'

/** The part of the fixture's project her conversation reads and moves. */
export interface ExchangeHost {
  revision: number
  exchange: boolean
  room?: RoomAsked
  /** Her conversation moved; absent, a press on it is unexpected. */
  onExchange?: (action: ExchangeAction) => void
}

/** The presses on a conversation already open, each at its own path. */
const CONTROLS = ['stop-speaking', 'end', 'resume'] as const

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })

/** The API's refusal of a write made at a room revision that has moved on. */
const stale = () =>
  new Response(
    JSON.stringify({
      code: 'stale_revision',
      message: 'The room changed',
      requestId: '00000000-0000-4000-8000-0000000000be',
      retry: 'never',
    }),
    { status: 409, headers: { 'content-type': 'application/json' } },
  )

const revisionAsked = (init: RequestInit | undefined): number | null => {
  const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  return typeof body === 'object' && body !== null && 'expectedRoomRevision' in body
    ? Number(body.expectedRoomRevision)
    : null
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
  if (path === `/api/v1/rooms/${ROOM}/exchanges`) {
    if (revisionAsked(init) !== host.revision) return stale()
    host.onExchange('start')
    publish()
    const receipt: ExchangeReceipt = {
      exchangeId: EXCHANGE,
      roomId: ROOM,
      revision: host.revision,
      inputActorId: host.room?.holder ?? membership.actorId,
    }
    return json(receipt)
  }
  const action = CONTROLS.find((c) => path === `/api/v1/exchanges/${EXCHANGE}/${c}`)
  if (!action || !host.exchange) return null
  host.onExchange(action)
  publish()
  return json(stateOf(host))
}
