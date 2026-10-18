// Verify actual API-issued RTC grants: members and bridge can send typed data; guests remain media-only.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { jwtVerify } from 'jose'
import { issueRoomToken, issueBridgeToken, muteUnmuted, PartialMute } from './livekit.ts'

const cfg = {
  url: 'wss://synthetic.livekit.test',
  apiKey: 'testkey',
  apiSecret: 'synthetic-secret-at-least-32-bytes-long',
}
async function dataGrant(token: string) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(cfg.apiSecret), { issuer: cfg.apiKey })
  const video = payload.video
  assert.ok(typeof video === 'object' && video !== null && 'canPublishData' in video)
  return video.canPublishData
}
it('permits actual member and bridge data grants while preserving the guest denial', async () => {
  for (const role of ['admin', 'editor', 'viewer'] as const) {
    const member = await issueRoomToken(cfg, {
      roomId: 'one-room',
      identity: role,
      name: null,
      canPublish: true,
      standing: { role },
    })
    assert.equal(await dataGrant(member.token), true)
  }
  const bridge = await issueBridgeToken(cfg, 'one-room')
  assert.equal(await dataGrant(bridge.token), true)
  const guest = await issueRoomToken(cfg, {
    roomId: 'one-room',
    identity: 'guest',
    name: null,
    canPublish: true,
    standing: { guest: true },
  })
  assert.equal(await dataGrant(guest.token), false)
})

it('a host mute counts only the tracks it muted: one already muted is neither muted again nor counted (Codex on #385)', async () => {
  const calls: string[] = []
  const rooms = {
    mutePublishedTrack: (_room: string, _who: string, sid: string) => {
      calls.push(sid)
      return Promise.resolve({} as never)
    },
  }
  assert.equal(await muteUnmuted(rooms, 'r', 'p', []), 0, 'nothing published')
  assert.equal(await muteUnmuted(rooms, 'r', 'p', [{ sid: 'mic', muted: true }]), 0, 'already muted')
  assert.deepEqual(calls, [])
  const tracks = [
    { sid: 'cam', muted: false },
    { sid: 'screen', muted: true },
    { sid: 'audio', muted: false },
  ]
  assert.equal(await muteUnmuted(rooms, 'r', 'p', tracks), 2)
  assert.deepEqual(calls, ['cam', 'audio'])
})

/** A room client whose mutes succeed `after` times, then fail. */
const failing = (after: number) => {
  let n = 0
  return {
    mutePublishedTrack: () => {
      n += 1
      return n > after ? Promise.reject(new Error('room server down')) : Promise.resolve({} as never)
    },
  }
}

it('a batch the room server fails partway says how many it muted; one that muted none fails as it was', async () => {
  const screen = [
    { sid: 'video', muted: false },
    { sid: 'audio', muted: false },
  ]
  const partly = await muteUnmuted(failing(1), 'r', 'p', screen).catch((err: unknown) => err)
  assert.ok(partly instanceof PartialMute)
  assert.equal(partly.muted, 1)
  const none = await muteUnmuted(failing(0), 'r', 'p', screen).catch((err: unknown) => err)
  assert.ok(none instanceof Error && !(none instanceof PartialMute))
})
