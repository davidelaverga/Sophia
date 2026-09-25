// Room-scoped LiveKit access tokens (architecture 06 §1, 13 §4). The grant names exactly one room, so a
// token issued for one project's room cannot join another; it is short-lived and carries no Google key.
import { AccessToken, TrackSource } from 'livekit-server-sdk'
import type { RoomToken } from '@sophia/contracts'

export interface LiveKitConfig {
  /** The URL browsers connect to (wss:// in production). */
  url: string
  apiKey: string
  apiSecret: string
}

/** Long enough to join and reconnect; a new token is requested for each join. */
export const ROOM_TOKEN_TTL_SECONDS = 600

export interface RoomGrant {
  roomId: string
  /** The verified actor: LiveKit's participant identity is the authority, never a display name. */
  identity: string
  name: string | null
  /** Viewers listen; only editors and admins publish their microphone. */
  canPublish: boolean
}

export async function issueRoomToken(cfg: LiveKitConfig, grant: RoomGrant, now = Date.now()): Promise<RoomToken> {
  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: grant.identity,
    ...(grant.name ? { name: grant.name } : {}),
    ttl: ROOM_TOKEN_TTL_SECONDS,
  })
  token.addGrant({
    roomJoin: true,
    room: grant.roomId,
    canSubscribe: true,
    canPublish: grant.canPublish,
    canPublishSources: grant.canPublish ? [TrackSource.MICROPHONE] : [],
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
