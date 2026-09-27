// The worker's remover against a REAL LiveKit server (the pinned image; `pnpm test:livekit`): a real rtc-node
// guest in the call is taken out, and the answer is evidence or a failure, never a guess. Skipped unless
// SOPHIA_TEST_LIVEKIT_URL names the server.
import { dispose, Room, RoomEvent } from '@livekit/rtc-node'
import { AccessToken } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, describe, it } from 'node:test'
import { liveKitRemover } from './room-removals.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const server = {
  url: URL ?? '',
  apiKey: process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey',
  apiSecret: process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine',
}

async function guestJoins(room: string, identity: string): Promise<{ room: Room; left: Promise<void> }> {
  const t = new AccessToken(server.apiKey, server.apiSecret, { identity, metadata: '{"guest":true}', ttl: 600 })
  t.addGrant({ roomJoin: true, room, canSubscribe: true, canPublish: false })
  const r = new Room()
  const left = new Promise<void>((resolve) => r.once(RoomEvent.Disconnected, () => resolve()))
  await r.connect(server.url, await t.toJwt(), { autoSubscribe: false, dynacast: false })
  return { room: r, left }
}

describe(
  'room removal against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    after(async () => {
      await dispose()
    })

    it('takes a guest out of the call, then reports them absent; an unreachable server is a failure', async () => {
      const roomId = randomUUID()
      const identity = randomUUID()
      const remove = liveKitRemover(server)
      const guest = await guestJoins(roomId, identity)
      assert.deepEqual(await remove(roomId, identity), { outcome: 'removed' })
      await Promise.race([
        guest.left,
        new Promise((_, reject) => setTimeout(() => reject(new Error('the guest was not disconnected')), 10_000)),
      ])
      assert.deepEqual(await remove(roomId, identity), { outcome: 'absent' }, 'gone, by the server’s own list')
      assert.deepEqual(await remove(randomUUID(), identity), { outcome: 'absent' }, 'a room nobody is in')
      const unreachable = await liveKitRemover({ ...server, url: 'ws://127.0.0.1:9' })(roomId, identity)
      assert.equal(unreachable.outcome, 'failed')
      await guest.room.disconnect().catch(() => undefined)
    })
  },
)
