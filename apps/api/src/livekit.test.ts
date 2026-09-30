// Verify actual API-issued RTC grants: members and bridge can send typed data; guests remain media-only.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { jwtVerify } from 'jose'
import { issueRoomToken, issueBridgeToken } from './livekit.ts'

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
