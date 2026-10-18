import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { muteUnmuted, PartialMute } from '../livekit.ts'
import { recordedIfDone, recordedStop } from './host-acts.ts'

// A host act is recorded only when it happened (docs/plans/activity-followups.md; Codex P2 on #355).
describe('a host act’s evidence', () => {
  it('is not written for an act that did nothing: no microphone, nothing on, no one to mute', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    for (const done of [false, 0]) await recordedIfDone(Promise.resolve(done), record)
    assert.equal(written, 0)
  })

  it('is written once for an act that did something', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    await recordedIfDone(Promise.resolve(true), record)
    await recordedIfDone(Promise.resolve(2), record)
    assert.equal(written, 2)
  })

  it('is written for a batch that failed after muting some, and the failure still answers (Codex on #385)', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    const failure = new PartialMute(1, new Error('room server down'))
    await assert.rejects(recordedIfDone(Promise.reject(failure), record), failure)
    assert.equal(written, 1)
    await assert.rejects(recordedIfDone(Promise.reject(new Error('down')), record), /down/)
    assert.equal(written, 1, 'a failure that changed nothing records nothing')
  })

  it('a partial batch over people records what `partly` says, never the whole act', async () => {
    let whole = 0
    const parts: string[] = []
    const failure = new PartialMute(1, new Error('down'), [{ identity: 'b', standing: 'editor' }])
    await assert.rejects(
      recordedIfDone(
        Promise.reject(failure),
        () => {
          whole += 1
          return Promise.resolve()
        },
        (p) => {
          parts.push(...p.participants.map((x) => x.identity))
          return Promise.resolve()
        },
      ),
      failure,
    )
    assert.deepEqual([whole, parts], [0, ['b']])
  })
})

/** Published tracks that are on. */
const unmuted = (...sids: string[]) => sids.map((sid) => ({ sid, muted: false }))

/**
 * The stop routes' own composition (rooms.ts: recordedStop over livekit.ts's stopCamera/stopScreen → muteUnmuted), with a
 * controlled room server in place of LiveKit: its mutes succeed until `failAt`, which fails. No real LiveKit fault is
 * injected; the route's Fastify and database layers are not run here.
 */
function stopping(act: 'camera' | 'screen', tracks: { sid: string; muted: boolean }[], failAt: number | null) {
  const muted: string[] = []
  const events: string[] = []
  const rooms = {
    mutePublishedTrack: (_room: string, _who: string, sid: string) => {
      if (muted.length === failAt) return Promise.reject(new Error('the room server refused the mute'))
      muted.push(sid)
      return Promise.resolve({} as never)
    },
  }
  const done = muteUnmuted(rooms, 'room', 'member', tracks).then((n) => n > 0)
  const ran = recordedStop(done, () => {
    events.push(act === 'screen' ? 'room.host_screen_off' : 'room.host_camera_off')
    return Promise.resolve()
  })
  return { ran, muted, events }
}

// Codex P2 on #385 (r4302170752): a screen share is its video and its sound. One muted and the other refused left the
// other live, yet a871 wrote room.host_screen_off ("Screen sharing stopped by an admin"). A member publishing two cameras
// is the same: fb797748 still wrote room.host_camera_off with one of them live (FND-A-C1-STOP-PARTIAL-NEIGHBOR-02).
describe('a screen or camera stop’s evidence (A31)', () => {
  for (const [act, order] of [
    ['screen', ['screen-video', 'screen-audio']],
    ['screen', ['screen-audio', 'screen-video']],
    ['camera', ['camera-a', 'camera-b']],
    ['camera', ['camera-b', 'camera-a']],
  ] as const) {
    it(`a ${act} stop that muted ${order[0]} and then failed records nothing, and the failure answers`, async () => {
      const { ran, muted, events } = stopping(act, unmuted(...order), 1)
      const failure = await ran.then(
        () => null,
        (err: unknown) => err,
      )
      assert.ok(failure instanceof PartialMute, 'the original failure propagates, as the partial mute it was')
      assert.equal(failure.muted, 1)
      assert.match((failure.cause as Error).message, /refused the mute/u)
      assert.deepEqual(muted, [order[0]], 'one publication was muted; the other stays live')
      assert.deepEqual(events, [], 'never "Screen sharing stopped" or "Camera turned off"')
    })
  }

  it('a screen stop that muted nothing fails as it was, and records nothing', async () => {
    const { ran, muted, events } = stopping('screen', unmuted('screen-video', 'screen-audio'), 0)
    await assert.rejects(ran, (err: unknown) => !(err instanceof PartialMute) && /refused the mute/u.test(String(err)))
    assert.deepEqual([muted, events], [[], []])
  })

  it('a screen stop that muted every publication records the stop once; one already muted records nothing', async () => {
    const all = stopping('screen', unmuted('screen-video', 'screen-audio'), null)
    await all.ran
    assert.deepEqual([all.muted, all.events], [['screen-video', 'screen-audio'], ['room.host_screen_off']])
    const rest = stopping('screen', [{ sid: 'screen-video', muted: true }, ...unmuted('screen-audio')], null)
    await rest.ran
    assert.deepEqual([rest.muted, rest.events], [['screen-audio'], ['room.host_screen_off']], 'what was left on, muted')
    const none = stopping(
      'screen',
      [
        { sid: 'screen-video', muted: true },
        { sid: 'screen-audio', muted: true },
      ],
      null,
    )
    await none.ran
    assert.deepEqual([none.muted, none.events], [[], []], 'a repeated stop changes nothing and says so')
  })

  it('a camera stop that muted every camera records it once; nothing for nothing; a refused one fails as it was', async () => {
    const one = stopping('camera', unmuted('camera'), null)
    await one.ran
    assert.deepEqual(one.events, ['room.host_camera_off'])
    const both = stopping('camera', unmuted('camera-a', 'camera-b'), null)
    await both.ran
    assert.deepEqual([both.muted, both.events], [['camera-a', 'camera-b'], ['room.host_camera_off']])
    const again = stopping('camera', [{ sid: 'camera', muted: true }], null)
    await again.ran
    assert.deepEqual(again.events, [])
    const refused = stopping('camera', unmuted('camera'), 0)
    await assert.rejects(refused.ran, /refused the mute/u)
    assert.deepEqual(refused.events, [])
  })
})
