// Room-scoped LiveKit access tokens (architecture 06 §1, 13 §4). The grant names exactly one room, so a
// token issued for one project's room cannot join another; it is short-lived and carries no Google key.
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk'
import type { RoomToken } from '@sophia/contracts'

export interface LiveKitConfig {
  /** The URL browsers connect to (wss:// in production). */
  url: string
  apiKey: string
  apiSecret: string
}

/** Long enough to join and reconnect; a new token is requested for each join. */
export const ROOM_TOKEN_TTL_SECONDS = 600

/** Who a participant is in the room, as everyone else's client reads it: a member's role, or a guest. */
export type RoomStanding = { role: 'admin' | 'editor' | 'viewer' } | { guest: true }

export interface RoomGrant {
  roomId: string
  /** The verified actor: LiveKit's participant identity is the authority, never a display name. */
  identity: string
  name: string | null
  /** Viewers listen and watch; editors, admins and admitted guests publish microphone, camera and screen. */
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
 * Take someone out of the call (a guest denied after being admitted). Best effort: they may already have
 * left, and their token expires within ROOM_TOKEN_TTL_SECONDS; the lobby record already refuses a new one.
 */
export async function removeFromRoom(cfg: LiveKitConfig, roomId: string, identity: string): Promise<boolean> {
  const api = cfg.url.replace(/^ws(s?):\/\//, 'http$1://')
  try {
    await new RoomServiceClient(api, cfg.apiKey, cfg.apiSecret).removeParticipant(roomId, identity)
    return true
  } catch {
    // Not in the room (or the server is unreachable): nothing more to take away.
    return false
  }
}
