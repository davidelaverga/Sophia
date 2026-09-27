// The LiveKit adapter against a REAL LiveKit server (the pinned livekit/livekit-server image, `pnpm dev`'s
// container) with real rtc-node participants. Google is not involved: this proves the room side only (what the
// bridge receives and publishes). Skipped unless SOPHIA_TEST_LIVEKIT_URL names the server, e.g.
//   SOPHIA_TEST_LIVEKIT_URL=ws://127.0.0.1:7880 node --test apps/media-bridge/src/rtc.livekit.test.ts
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  dispose,
  LocalAudioTrack,
  LocalVideoTrack,
  type RemoteTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource,
} from '@livekit/rtc-node'
import { AccessToken, TrackSource as GrantSource } from 'livekit-server-sdk'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, describe, it } from 'node:test'
import { joinLiveKitRoom, type RoomEvents, type RoomPerson, SOPHIA_IDENTITY } from './rtc.ts'

const URL = process.env.SOPHIA_TEST_LIVEKIT_URL
const KEY = process.env.SOPHIA_TEST_LIVEKIT_KEY ?? 'devkey'
const SECRET = process.env.SOPHIA_TEST_LIVEKIT_SECRET ?? 'dev-only-livekit-secret-for-this-machine'

/** Grants as the API issues them (apps/api/src/livekit.ts): only the bridge may set its own attributes. */
async function token(room: string, identity: string, metadata: object, sources: GrantSource[]): Promise<string> {
  const t = new AccessToken(KEY, SECRET, { identity, metadata: JSON.stringify(metadata), ttl: 600 })
  t.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: sources.length > 0,
    canPublishSources: sources,
    canPublishData: false,
    canUpdateOwnMetadata: identity === SOPHIA_IDENTITY,
  })
  return t.toJwt()
}

async function until(what: string, check: () => boolean, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

/** A human participant publishing a microphone tone (48 kHz stereo: the bridge must get 16 kHz mono). */
async function human(room: string, identity: string, metadata: object, withScreen = false) {
  const r = new Room()
  const sources = [GrantSource.MICROPHONE, GrantSource.SCREEN_SHARE]
  await r.connect(URL ?? '', await token(room, identity, metadata, sources), { autoSubscribe: true, dynacast: false })
  const mic = new AudioSource(48_000, 2)
  await r.localParticipant?.publishTrack(
    LocalAudioTrack.createAudioTrack('mic', mic),
    new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
  )
  const screen = new VideoSource(64, 48)
  if (withScreen) {
    await r.localParticipant?.publishTrack(
      LocalVideoTrack.createVideoTrack('screen', screen),
      new TrackPublishOptions({ source: TrackSource.SOURCE_SCREENSHARE }),
    )
  }
  let phase = 0
  const pump = setInterval(() => {
    const samples = Int16Array.from({ length: 480 * 2 }, (_, i) => Math.round(8000 * Math.sin((phase + i) / 8)))
    phase += 480
    mic.captureFrame(new AudioFrame(samples, 48_000, 2, 480)).catch(() => undefined)
    if (withScreen)
      screen.captureFrame(new VideoFrame(new Uint8Array(64 * 48 * 4).fill(120), 64, 48, VideoBufferType.RGBA))
  }, 10)
  return {
    room: r,
    close: async () => {
      clearInterval(pump)
      await r.disconnect()
    },
  }
}

function recorder() {
  const seen = {
    people: [] as RoomPerson[],
    audio: new Map<string, { frames: number; rate: number; channels: number }>(),
    frames: new Map<string, number>(),
  }
  const events: RoomEvents = {
    people: (people) => {
      seen.people = people
    },
    audio: (identity, _samples, rate, channels) => {
      const prior = seen.audio.get(identity)
      seen.audio.set(identity, { frames: (prior?.frames ?? 0) + 1, rate, channels })
    },
    frame: (identity, source) => {
      seen.frames.set(`${identity}:${source}`, (seen.frames.get(`${identity}:${source}`) ?? 0) + 1)
    },
    connection: () => undefined,
  }
  return { seen, events }
}

describe(
  'LiveKit adapter against a real LiveKit server',
  { skip: URL ? false : 'SOPHIA_TEST_LIVEKIT_URL not set' },
  () => {
    after(async () => {
      await dispose()
    })

    it('hears members only (16 kHz mono), publishes one Sophia track, and watches only the chosen screen', async () => {
      const roomName = randomUUID()
      const luisId = randomUUID()
      const luis = await human(roomName, luisId, { role: 'editor' }, true)
      const guest = await human(roomName, `guest-${randomUUID().slice(0, 8)}`, { guest: true })
      const { seen, events } = recorder()
      const bridgeToken = await token(roomName, SOPHIA_IDENTITY, { sophia: true }, [GrantSource.MICROPHONE])
      const bridge = await joinLiveKitRoom({ serverUrl: URL ?? '', token: bridgeToken }, events)

      // What Luis hears from Sophia, and what he sees of her attributes.
      let sophiaFrames = 0
      let attributes: Record<string, string> = {}
      luis.room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, who) => {
        if (who.identity !== SOPHIA_IDENTITY || track.kind !== TrackKind.KIND_AUDIO) return
        void (async () => {
          for await (const frame of new AudioStream(track, 24_000, 1))
            if (frame.data.some((s) => s !== 0)) sophiaFrames += 1
        })()
      })
      luis.room.on(RoomEvent.ParticipantAttributesChanged, (_changed, who) => {
        if (who.identity === SOPHIA_IDENTITY) attributes = { ...who.attributes }
      })

      try {
        await until('both people listed', () => seen.people.length === 2)
        assert.deepEqual(
          seen.people.toSorted((a, b) => a.standing.localeCompare(b.standing)),
          [
            { identity: luisId, standing: 'editor' },
            { identity: seen.people.find((p) => p.standing === 'guest')?.identity, standing: 'guest' },
          ],
        )
        assert.ok(!seen.people.some((p) => p.identity === SOPHIA_IDENTITY))

        await until('Luis’s microphone at the bridge', () => (seen.audio.get(luisId)?.frames ?? 0) > 20)
        assert.equal(seen.audio.get(luisId)?.rate, 16_000)
        assert.equal(seen.audio.get(luisId)?.channels, 1)
        assert.equal([...seen.audio.keys()].length, 1, 'the guest’s microphone is never received')
        assert.equal(seen.frames.size, 0, 'no screen is received before someone chooses to show it')

        const tone = Int16Array.from({ length: 480 }, (_, i) => Math.round(6000 * Math.sin(i / 5)))
        const speak = setInterval(() => void bridge.play(tone).catch(() => undefined), 20)
        await until('Luis hears Sophia', () => sophiaFrames > 10)
        clearInterval(speak)
        bridge.clearPlayback()

        await bridge.setState({ 'sophia.voice': 'ready', 'sophia.input': 'admitted' })
        await until('Sophia’s attributes at Luis', () => attributes['sophia.voice'] === 'ready')

        bridge.watch({ participantIdentity: luisId, source: 'screen' })
        await until('the chosen screen at the bridge', () => (seen.frames.get(`${luisId}:screen`) ?? 0) >= 2)
        bridge.watch(null)
        await new Promise((resolve) => setTimeout(resolve, 1500))
        const stopped = seen.frames.get(`${luisId}:screen`) ?? 0
        await new Promise((resolve) => setTimeout(resolve, 2500))
        assert.equal(seen.frames.get(`${luisId}:screen`) ?? 0, stopped, 'Stop Looking: no more frames')
      } finally {
        await bridge.close()
        await luis.close()
        await guest.close()
      }
    })
  },
)
