// How a join opens its connection (useProjectRoom's joinConnection): a token from the API, then LiveKit, with the
// checks a join passes on the way, and the microphone it starts with. Its own module over an injected LiveKit, so the
// checks are unit-tested; useProjectRoom keeps the one import of LiveKit, which the fixtures replace.
import type { RoomToken } from '@sophia/contracts'
import { keptIfStill } from './call-fence.ts'
import type { RoomCallbacks, RoomConnection } from './livekit-room.ts'

/** LiveKit's connect, as the room's module gives it. */
export type ConnectRoom = (serverUrl: string, token: string, cb: RoomCallbacks) => Promise<RoomConnection>

/** What a join asks before LiveKit: whether it is still the current one, and still wanted (a try back in). */
export interface Gate {
  current: () => boolean
  still: (() => boolean) | undefined
}

/**
 * The call a token names, for this browser's other tabs (call-tabs.ts): its LiveKit room and the person in it, read
 * from the token's subject (LiveKit's identity) without trusting it for anything else; the room alone where the token
 * says none.
 */
export function scopeOf(issued: RoomToken): string {
  try {
    const body = issued.token.split('.')[1] ?? ''
    const claims: unknown = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
    const sub = typeof claims === 'object' && claims !== null && 'sub' in claims ? claims.sub : null
    return typeof sub === 'string' ? `${issued.roomId}:${sub}` : issued.roomId
  } catch {
    return issued.roomId
  }
}

/**
 * A token from the API (`issue`), then LiveKit (`load`, which loads only now: it is most of the Studio's weight). A
 * join overtaken while they came (a Leave during a try back in, the page going) goes no further, so once its token is
 * back the room never sees it flash in and out. Nor does a join no longer wanted (`still`): a try back in whose token
 * came too late. Asked again once connected, before it becomes the call and its microphone starts: one no longer wanted
 * is left quietly, so the disconnect LiveKit reports for that leave is never taken for the call's end.
 */
export async function openRoom(
  issue: () => Promise<RoomToken>,
  load: () => Promise<ConnectRoom>,
  scoped: (scope: string) => void,
  cb: RoomCallbacks,
  gate: Gate,
): Promise<RoomConnection> {
  const issued = await issue()
  scoped(scopeOf(issued))
  const connectRoom = await load()
  if (!gate.current()) throw new Error('This join was overtaken before it connected')
  if (gate.still && !gate.still()) throw new Error('This try back in came too late to connect')
  let quiet = false
  const ended: RoomCallbacks['onEnded'] = (why, selfLeft) => {
    if (!quiet) cb.onEnded(why, selfLeft)
  }
  const opened = await connectRoom(issued.serverUrl, issued.token, { ...cb, onEnded: ended })
  return keptIfStill(opened, gate.still, () => {
    quiet = true
  })
}

/**
 * The microphone a join starts with: the one carried to it (a choice made before it, a failed join's for Try again, a
 * dropped call's), never on unless this device's own `choice` is on as the join begins; with none carried, `otherwise`.
 */
export const micToStart =
  (carried: boolean | undefined, otherwise: () => boolean, choice: () => boolean) => (): boolean =>
    carried === undefined ? otherwise() : carried && choice()
