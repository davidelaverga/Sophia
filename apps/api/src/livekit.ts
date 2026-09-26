// Room-scoped LiveKit access tokens (architecture 06 §1, 13 §4). The grant names exactly one room, so a
// token issued for one project's room cannot join another; it is short-lived and carries no Google key.
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { RoomToken } from '@sophia/contracts'
import type { RemovalOutcome } from '@sophia/persistence'

export interface LiveKitConfig {
  /** The URL browsers connect to (wss:// in production). */
  url: string
  apiKey: string
  apiSecret: string
}

/** Long enough to join and reconnect; a new token is requested for each join. */
export const ROOM_TOKEN_TTL_SECONDS = 600
/**
 * How long the database keeps Sophia from opening or resuming after a guest's token is stamped, just before its mint
 * (migration 0015's `630 seconds`): the token's life, plus 30 s for the step to the mint and clock differences.
 */
export const GUEST_FENCE_SECONDS = ROOM_TOKEN_TTL_SECONDS + 30

/** Who a participant is in the room, as everyone else's client reads it: a member's role, a guest, or Sophia. */
export type RoomStanding = { role: 'admin' | 'editor' | 'viewer' } | { guest: true } | { sophia: true }

/**
 * The media bridge's identity in every room (amendment A06). Human identities are verified actor UUIDs, so no person can
 * be issued this identity, and a client can trust that the participant named `sophia` is the bridge.
 */
export const SOPHIA_IDENTITY = 'sophia'

export interface RoomGrant {
  roomId: string
  /** The verified actor: LiveKit's participant identity is the authority, never a display name. */
  identity: string
  name: string | null
  /** Members (viewers too, since A06) and admitted guests publish microphone, camera and screen. */
  canPublish: boolean
  /** Set by the API and not changeable by the participant (canUpdateOwnMetadata is false). */
  standing: RoomStanding
}

/** What a publishing participant may send: voice, camera, and a chosen screen or window with its sound. */
const PUBLISH_SOURCES = [
  TrackSource.MICROPHONE,
  TrackSource.CAMERA,
  TrackSource.SCREEN_SHARE,
  TrackSource.SCREEN_SHARE_AUDIO,
]

export async function issueRoomToken(cfg: LiveKitConfig, grant: RoomGrant, now = Date.now()): Promise<RoomToken> {
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: grant.identity,
    ...(grant.name ? { name: grant.name } : {}),
    metadata: JSON.stringify(grant.standing),
    ttl: ROOM_TOKEN_TTL_SECONDS,
  })
  token.addGrant({
    roomJoin: true,
    room: grant.roomId,
    canSubscribe: true,
    canPublish: grant.canPublish,
    canPublishSources: grant.canPublish ? PUBLISH_SOURCES : [],
    canPublishData: false,
    canUpdateOwnMetadata: false,
  })
  return {
    roomId: grant.roomId,
    serverUrl: cfg.url,
    token: await token.toJwt(),
    expiresAt: new Date(now + ROOM_TOKEN_TTL_SECONDS * 1000).toISOString(),
  }
}

/**
 * The bridge's token for one room: it subscribes to the people and publishes one audio track, Sophia's, as the
 * `sophia` identity, and may set its own attributes (what it observes: input, output). No camera, no screen.
 */
export async function issueBridgeToken(cfg: LiveKitConfig, roomId: string, now = Date.now()): Promise<RoomToken> {
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: SOPHIA_IDENTITY,
    name: 'Sophia',
    metadata: JSON.stringify({ sophia: true } satisfies RoomStanding),
    ttl: ROOM_TOKEN_TTL_SECONDS,
  })
  token.addGrant({
    roomJoin: true,
    room: roomId,
    canSubscribe: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canPublishData: false,
    canUpdateOwnMetadata: true,
  })
  return {
    roomId,
    serverUrl: cfg.url,
    token: await token.toJwt(),
    expiresAt: new Date(now + ROOM_TOKEN_TTL_SECONDS * 1000).toISOString(),
  }
}

export type Standing = 'admin' | 'editor' | 'viewer' | 'guest' | 'sophia' | 'unknown'

/** A participant's standing from the metadata the API signed into their token; nothing else. */
export function standingOf(metadata: string | undefined): Standing {
  let value: unknown
  try {
    value = JSON.parse(metadata ?? 'null')
  } catch {
    return 'unknown'
  }
  if (typeof value !== 'object' || value === null) return 'unknown'
  if ('guest' in value && value.guest === true) return 'guest'
  if ('sophia' in value && value.sophia === true) return 'sophia'
  return roleOf('role' in value ? value.role : undefined)
}

const roleOf = (role: unknown): Standing =>
  role === 'admin' || role === 'editor' || role === 'viewer' ? role : 'unknown'

const apiUrl = (cfg: LiveKitConfig) => cfg.url.replace(/^ws(s?):\/\//, 'http$1://')

/**
 * Who is in the room right now, as the LiveKit server reports it: trusted presence (A06/A12), never a client's
 * claim. A room nobody joined yet is empty. An unreachable server throws: callers fail closed.
 */
export async function roomParticipants(
  cfg: LiveKitConfig,
  roomId: string,
): Promise<Array<{ identity: string; standing: Standing }>> {
  try {
    const people = await new RoomServiceClient(apiUrl(cfg), cfg.apiKey, cfg.apiSecret).listParticipants(roomId)
    return people.map((p) => ({ identity: p.identity, standing: standingOf(p.metadata) }))
  } catch (err: unknown) {
    if (err instanceof Error && /not.?found|does not exist/i.test(err.message)) return []
    throw err
  }
}

/**
 * Take someone out of the call (a guest declined or blocked after being let in; amendment A07). The answer is
 * evidence or it is a failure: `removed` when the server removed them, `absent` only when the server itself lists
 * them gone, and otherwise `failed`, which keeps the removal pending (migration 0014) until the worker retries it.
 */
export async function removeParticipant(cfg: LiveKitConfig, roomId: string, identity: string): Promise<RemovalOutcome> {
  try {
    await new RoomServiceClient(apiUrl(cfg), cfg.apiKey, cfg.apiSecret).removeParticipant(roomId, identity)
    return { outcome: 'removed' }
  } catch (err: unknown) {
    const people = await roomParticipants(cfg, roomId).catch(() => null)
    if (people && !people.some((p) => p.identity === identity)) return { outcome: 'absent' }
    return { outcome: 'failed', error: err instanceof Error ? err.message.slice(0, 300) : 'removal failed' }
  }
}
