// A host act on someone who is no longer in the call, against a REAL LiveKit server (the pinned image;
// `pnpm test:livekit`): the server's own «not found» for a person not in the room reads as nothing to mute (Codex P2
// on #369, docs/plans/mute-all-past-a-leaver.md). The unit tests in livekit.test.ts answer as this server does; this
// pins that answer. Skipped unless SOPHIA_TEST_LIVEKIT_URL names the server.
import { RoomServiceClient } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import { muteMicrophone, stopCamera, stopScreen } from './livekit.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const server = {
  url: URL ?? '',
  apiKey: process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey',
  apiSecret: process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine',
}

describe(
  'a host act on someone gone, against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    it('someone not in the room has nothing to mute: false, not an error', async () => {
      const open = randomUUID()
      const rooms = new RoomServiceClient(server.url.replace(/^ws/, 'http'), server.apiKey, server.apiSecret)
      await rooms.createRoom({ name: open, emptyTimeout: 60 })
      try {
        const gone = randomUUID()
        assert.equal(await muteMicrophone(server, open, gone), false)
        assert.equal(await stopCamera(server, open, gone), false)
        assert.equal(await stopScreen(server, open, gone), false)
      } finally {
        await rooms.deleteRoom(open).catch(() => undefined)
      }
    })
  },
)
