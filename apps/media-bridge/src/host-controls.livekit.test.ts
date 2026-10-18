// The API's host controls (A24, A31; docs/plans/host-controls.md) against a REAL LiveKit server (the pinned image; `pnpm
// test:livekit`), with real rtc-node participants. It lives beside the bridge's LiveKit test, which already joins
// people this way and imports the API's LiveKit module. Skipped unless SOPHIA_TEST_LIVEKIT_URL names the server.
import {
  AudioFrame,
  AudioSource,
  dispose,
  LocalAudioTrack,
  LocalVideoTrack,
  Room,
  RoomEvent,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
} from '@livekit/rtc-node'
import { RoomServiceClient, TrackSource as ServerSource } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, describe, it } from 'node:test'
import {
  issueRoomToken,
  memberInRoom,
  muteMicrophone,
  removeFromCall,
  stopScreen,
  type RoomStanding,
} from '../../api/src/livekit.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const server = {
  url: URL ?? '',
  apiKey: process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey',
  apiSecret: process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine',
}

/** Someone in the call as the API lets them in, publishing a microphone. */
async function joins(room: string, identity: string, standing: RoomStanding) {
  const { token } = await issueRoomToken(server, { roomId: room, identity, name: null, canPublish: true, standing })
  const r = new Room()
  const left = new Promise<void>((resolve) => r.once(RoomEvent.Disconnected, () => resolve()))
  await r.connect(server.url, token, { autoSubscribe: false, dynacast: false })
  await r.localParticipant?.publishTrack(
    LocalAudioTrack.createAudioTrack('mic', new AudioSource(48_000, 1)),
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  )
  return { room: r, left }
}

/** A member sharing a screen with its sound, as a browser's share publishes them: frames and samples flowing. */
async function shares(room: string, identity: string) {
  const standing = { role: 'editor' } as const
  const { token } = await issueRoomToken(server, { roomId: room, identity, name: null, canPublish: true, standing })
  const r = new Room()
  await r.connect(server.url, token, { autoSubscribe: false, dynacast: false })
  const picture = new VideoSource(64, 48)
  const sound = new AudioSource(48_000, 1)
  await r.localParticipant?.publishTrack(
    LocalVideoTrack.createVideoTrack('screen', picture),
    new TrackPublishOptions({ source: TrackSource.SOURCE_SCREENSHARE }),
  )
  await r.localParticipant?.publishTrack(
    LocalAudioTrack.createAudioTrack('screen-audio', sound),
    new TrackPublishOptions({ source: TrackSource.SOURCE_SCREENSHARE_AUDIO }),
  )
  const pump = setInterval(() => {
    picture.captureFrame(new VideoFrame(new Uint8Array(64 * 48 * 4).fill(120), 64, 48, VideoBufferType.RGBA))
    sound.captureFrame(new AudioFrame(new Int16Array(480), 48_000, 1, 480)).catch(() => undefined)
  }, 10)
  return {
    room: r,
    close: async () => {
      clearInterval(pump)
      await r.disconnect()
    },
  }
}

const within = (what: string, done: Promise<unknown>, ms = 10_000) =>
  Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error(what)), ms))])

/** Resolves once `holds` is true, asked every 100 ms. */
async function until(holds: () => boolean | Promise<boolean>) {
  while (!(await holds())) await new Promise((resolve) => setTimeout(resolve, 100))
}

describe(
  'host controls against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    after(async () => {
      await dispose()
    })

    it('mutes a member’s microphone, takes a member out, and knows a guest or someone absent is no member here', async () => {
      const roomId = randomUUID()
      const member = randomUUID()
      const guest = randomUUID()
      const them = await joins(roomId, member, { role: 'editor' })
      const visitor = await joins(roomId, guest, { guest: true })
      try {
        assert.equal(await memberInRoom(server, roomId, member), true)
        assert.equal(await memberInRoom(server, roomId, guest), false, 'a guest leaves by the door')
        assert.equal(await memberInRoom(server, roomId, randomUUID()), false, 'nobody of that name is in the call')
        assert.equal(await muteMicrophone(server, roomId, member), true)
        const rooms = new RoomServiceClient(server.url.replace(/^ws/, 'http'), server.apiKey, server.apiSecret)
        const mic = (await rooms.getParticipant(roomId, member)).tracks.find(
          (t) => t.source === ServerSource.MICROPHONE,
        )
        assert.equal(mic?.muted, true)
        assert.equal(
          await muteMicrophone(server, roomId, member),
          false,
          'muted again: nothing changed, nothing recorded',
        )
        await removeFromCall(server, roomId, member)
        await within('the member was not disconnected', them.left)
        assert.equal(await memberInRoom(server, roomId, member), false)
      } finally {
        await them.room.disconnect().catch(() => undefined)
        await visitor.room.disconnect().catch(() => undefined)
      }
    })

    // Codex P1 on #369: the screen stop crosses the server to the sharer's own client, which the fixture can't show.
    it('stops a member’s screen share: its picture and its sound muted on the server, and the sharer’s client told', async () => {
      const roomId = randomUUID()
      const sharer = randomUUID()
      const talker = randomUUID()
      const them = await shares(roomId, sharer)
      const other = await joins(roomId, talker, { role: 'editor' })
      const told = new Set<TrackSource>()
      them.room.on(RoomEvent.TrackMuted, (publication, participant) => {
        if (participant.identity === sharer && publication.source !== undefined) told.add(publication.source)
      })
      const rooms = new RoomServiceClient(server.url.replace(/^ws/, 'http'), server.apiKey, server.apiSecret)
      const listed = async () => (await rooms.getParticipant(roomId, sharer)).tracks
      try {
        await within(
          'the share was never listed',
          until(async () => (await listed()).length === 2),
        )
        assert.equal(await stopScreen(server, roomId, sharer), true)
        const tracks = await listed()
        for (const source of [ServerSource.SCREEN_SHARE, ServerSource.SCREEN_SHARE_AUDIO])
          assert.equal(tracks.find((t) => t.source === source)?.muted, true, `source ${String(source)} muted`)
        // The mute reaches the sharer's own client for both publications: there, the Studio stops sharing.
        await within(
          'the sharer’s client was not told',
          until(() => told.size === 2),
        )
        assert.deepEqual(told, new Set([TrackSource.SOURCE_SCREENSHARE, TrackSource.SOURCE_SCREENSHARE_AUDIO]))
        // Stopped again: both already muted, so nothing changes and nothing is recorded (changed-only, Codex P2 on #385).
        assert.equal(
          await stopScreen(server, roomId, sharer),
          false,
          'stopped again: nothing changed, nothing recorded',
        )
        const again = await listed()
        for (const source of [ServerSource.SCREEN_SHARE, ServerSource.SCREEN_SHARE_AUDIO])
          assert.equal(again.find((t) => t.source === source)?.muted, true, `source ${String(source)} still muted`)
        assert.equal(await stopScreen(server, roomId, talker), false, 'no screen shared, nothing to stop')
        const mic = (await rooms.getParticipant(roomId, talker)).tracks.find(
          (t) => t.source === ServerSource.MICROPHONE,
        )
        assert.equal(mic?.muted, false, 'a microphone is not a screen')
      } finally {
        await them.close().catch(() => undefined)
        await other.room.disconnect().catch(() => undefined)
      }
    })
  },
)
