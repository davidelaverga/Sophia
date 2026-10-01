// Which rooms one read of the Work list asks, against a REAL LiveKit server (the pinned image; `pnpm test:livekit`):
// a room is asked as soon as it exists, whatever its count of participants says, since the server refreshes that
// count only every few seconds and someone who just joined would read as nobody. Skipped unless
// SOPHIA_TEST_LIVEKIT_URL names the server.
import { RoomServiceClient } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { liveRooms, roomParticipants } from './livekit.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const server = {
  url: URL ?? '',
  apiKey: process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey',
  apiSecret: process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine',
}

describe(
  'the rooms the Work list asks, against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    it('asks a room as soon as it exists, whatever its count says, and never one that does not', async () => {
      const open = randomUUID()
      const never = randomUUID()
      const rooms = new RoomServiceClient(server.url.replace(/^ws/, 'http'), server.apiKey, server.apiSecret)
      await rooms.createRoom({ name: open, emptyTimeout: 60 })
      try {
        assert.deepEqual([...(await liveRooms(server, [open, never]))], [open])
        assert.deepEqual(await roomParticipants(server, open), [], 'and asked, it says who is in it: nobody yet')
        assert.deepEqual([...(await liveRooms(server, []))], [])
      } finally {
        await rooms.deleteRoom(open).catch(() => undefined)
      }
    })
  },
)
