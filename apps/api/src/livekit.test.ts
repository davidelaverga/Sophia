// Verify actual API-issued RTC grants: members and bridge can send typed data; guests remain media-only.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, it } from 'node:test'
import { jwtVerify } from 'jose'
import { ServerError, TrackSource } from 'livekit-server-sdk'
import {
  issueBridgeToken,
  issueRoomToken,
  muteEveryone,
  muteMicrophone,
  muteSources,
  muteUnmuted,
  PartialMute,
  SCREEN_SOURCES,
  stopCamera,
  stopScreen,
} from './livekit.ts'

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

/** LiveKit's answer for a participant or track that is no longer there: Twirp's not_found, HTTP 404. */
const notFound = () => new ServerError('Not Found', 'participant does not exist', 404, 'not_found')

/**
 * A room client holding one person's screen share and its sound, listed in `order`. Muting the share stops their
 * sharing, as their Studio does (livekit-room.ts: a host-muted ScreenShare → setScreenShareEnabled(false)), so the sound
 * is gone after it: its mute is refused as not found. `refuse` answers one sid's mute with an error instead.
 */
function sharing(order: readonly ('video' | 'audio')[], refuse: { sid: string; err: Error } | null = null) {
  const source = { video: TrackSource.SCREEN_SHARE, audio: TrackSource.SCREEN_SHARE_AUDIO }
  const live = new Set<string>(order)
  const muted: string[] = []
  const rooms = {
    getParticipant: () =>
      Promise.resolve({ tracks: order.map((sid) => ({ sid, source: source[sid], muted: false })) } as never),
    mutePublishedTrack: (_room: string, _who: string, sid: string) => {
      if (refuse?.sid === sid) return Promise.reject(refuse.err)
      if (!live.has(sid)) return Promise.reject(notFound())
      muted.push(sid)
      if (sid === 'video') live.clear()
      return Promise.resolve({} as never)
    },
  }
  return { rooms, muted }
}

// Codex P2 on #369 (issue draft item 3): muted after the share, the sound was already gone and the stop failed.
describe('a screen stop mutes the sound before the share (A31)', () => {
  for (const order of [
    ['video', 'audio'],
    ['audio', 'video'],
  ] as const) {
    it(`listed ${order.join(' then ')}: the sound first, then the share; both counted`, async () => {
      const { rooms, muted } = sharing(order)
      assert.equal(await muteSources(rooms, 'r', 'p', SCREEN_SOURCES), 2)
      assert.deepEqual(muted, ['audio', 'video'])
    })
  }

  it('a sound already gone is done, not a failure: the share is muted and counted alone', async () => {
    const { rooms, muted } = sharing(['audio', 'video'], { sid: 'audio', err: notFound() })
    assert.equal(await muteSources(rooms, 'r', 'p', SCREEN_SOURCES), 1)
    assert.deepEqual(muted, ['video'])
  })

  it('any other refusal fails as before: the error itself first, a partial mute after the sound', async () => {
    const down = new ServerError('Internal Server Error', 'room server down', 500, 'internal')
    const first = await muteSources(
      sharing(['video', 'audio'], { sid: 'audio', err: down }).rooms,
      'r',
      'p',
      SCREEN_SOURCES,
    ).catch((err: unknown) => err)
    assert.equal(first, down)
    const refused = new ServerError('Unauthorized', 'no', 401, 'unauthenticated')
    const after = await muteSources(
      sharing(['video', 'audio'], { sid: 'video', err: refused }).rooms,
      'r',
      'p',
      SCREEN_SOURCES,
    ).catch((err: unknown) => err)
    assert.ok(after instanceof PartialMute)
    assert.equal(after.muted, 1)
    assert.equal(after.cause, refused)
  })
})

/** A room client that answers each sid's mute with `answers[sid]`: a track, nothing, or a refusal. */
const answering = (answers: Record<string, () => Promise<unknown>>) => ({
  mutePublishedTrack: (_room: string, _who: string, sid: string) => answers[sid]!() as Promise<never>,
})
const track = () => Promise.resolve({ sid: 'muted' })

describe('a mute of a track already gone changes nothing and is not counted', () => {
  it('a refusal with the code not_found is gone, not a failure, whatever its status', async () => {
    const err = new ServerError('Gone', 'participant does not exist', 400, 'not_found')
    const rooms = answering({ gone: () => Promise.reject(err), live: track })
    assert.equal(await muteUnmuted(rooms, 'r', 'p', unmutedTracks('gone', 'live')), 1)
  })

  // A 404 is not enough: Twirp's bad_route and a proxy's error page in front of the server are 404 too, and read as
  // gone, every mute and stop would answer done having done nothing.
  for (const [how, err] of [
    ['only HTTP 404 (a body that is not JSON, so no code)', new ServerError('Not Found', '<html>', 404)],
    ['HTTP 404 and the code bad_route', new ServerError('Not Found', 'no such method', 404, 'bad_route')],
  ] as const) {
    it(`a refusal with ${how} still fails`, async () => {
      const rooms = answering({ gone: () => Promise.reject(err), live: track })
      await assert.rejects(muteUnmuted(rooms, 'r', 'p', unmutedTracks('gone', 'live')), (e: unknown) => e === err)
    })
  }

  it('the room server answering with no track (the pinned server, for one no longer published) mutes nothing', async () => {
    const rooms = answering({ mic: () => Promise.resolve(undefined), live: track })
    assert.equal(
      await muteUnmuted(rooms, 'r', 'p', unmutedTracks('mic')),
      0,
      'a microphone unpublished before its mute',
    )
    assert.equal(await muteUnmuted(rooms, 'r', 'p', unmutedTracks('mic', 'live')), 1)
  })
})

function unmutedTracks(...sids: string[]) {
  return sids.map((sid) => ({ sid, muted: false }))
}

/** One published track of theirs, on. */
const published = (identity: string, source: string) => ({ sid: `${source}_${identity}`, source, muted: false })

/**
 * A room server over HTTP whose answers the test sets (as host-mute-all.db.test.ts's), so what the code sees is the
 * SDK's own error. `people` are listed; `left` are listed but gone by their turn (LiveKit's not_found); `fail` answer
 * their read with this status and Twirp code.
 */
async function roomServer(people: string[], left: string[] = [], fail: Record<string, [number, string]> = {}) {
  const asked: string[] = []
  const muted: string[] = []
  const participant = (identity: string) => ({
    identity,
    name: identity,
    metadata: JSON.stringify({ role: 'editor' }),
    tracks: ['MICROPHONE', 'CAMERA', 'SCREEN_SHARE', 'SCREEN_SHARE_AUDIO'].map((s) => published(identity, s)),
  })
  const answer = (method: string, body: { identity?: string; trackSid?: string }): [number, unknown] => {
    if (method === 'ListParticipants') return [200, { participants: people.map(participant) }]
    const who = body.identity ?? ''
    if (method === 'GetParticipant') asked.push(who)
    const failure = fail[who]
    if (failure) return [failure[0], { code: failure[1], msg: 'the room server failed' }]
    if (left.includes(who) || !people.includes(who)) return [404, { code: 'not_found', msg: 'participant not found' }]
    if (method === 'GetParticipant') return [200, participant(who)]
    if (method === 'MutePublishedTrack') {
      muted.push(body.trackSid ?? '')
      return [200, { track: { sid: body.trackSid, muted: true } }]
    }
    return [404, { code: 'bad_route', msg: method }]
  }
  const server = createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')))
    req.on('end', () => {
      const [status, body] = answer(req.url?.split('/').at(-1) ?? '', raw ? (JSON.parse(raw) as object) : {})
      res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const lk = { ...cfg, url: `ws://127.0.0.1:${String((server.address() as AddressInfo).port)}` }
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()))
  return { lk, asked, muted, close }
}

describe('a host act on someone who left after the room was listed (Codex P2 on #369)', () => {
  it('mute everyone carries on past them: the third is muted, two are counted, no partial failure', async () => {
    const room = await roomServer(['host', 'b', 'c', 'd'], ['c'])
    try {
      assert.equal(await muteEveryone(room.lk, 'r', 'host'), 2)
      assert.deepEqual(room.asked, ['b', 'c', 'd'], 'the host is never asked; c, gone, does not stop d')
      assert.deepEqual(room.muted, ['MICROPHONE_b', 'MICROPHONE_d'])
    } finally {
      await room.close()
    }
  })

  it('any other failure still stops it: a partial failure naming only those muted before it', async () => {
    const room = await roomServer(['host', 'b', 'c', 'd'], [], { c: [500, 'internal'] })
    try {
      const err = await muteEveryone(room.lk, 'r', 'host').catch((e: unknown) => e)
      assert.ok(err instanceof PartialMute)
      assert.equal(err.muted, 1)
      assert.deepEqual(err.participants, [{ identity: 'b', standing: 'editor' }])
      assert.deepEqual(room.asked, ['b', 'c'], 'd is never asked')
    } finally {
      await room.close()
    }
  })

  it('a 404 that is not «not found» (a wrong route) is a failure, not someone gone', async () => {
    const room = await roomServer(['host', 'b'], [], { b: [404, 'bad_route'] })
    try {
      const err = await muteEveryone(room.lk, 'r', 'host').catch((e: unknown) => e)
      assert.ok(err instanceof Error && !(err instanceof PartialMute))
      await assert.rejects(muteMicrophone(room.lk, 'r', 'b'))
    } finally {
      await room.close()
    }
  })

  it('a single mute, camera stop or screen stop of someone gone did nothing: false, not an error', async () => {
    const room = await roomServer(['host', 'b'], ['b'])
    try {
      assert.equal(await muteMicrophone(room.lk, 'r', 'b'), false)
      assert.equal(await stopCamera(room.lk, 'r', 'b'), false)
      assert.equal(await stopScreen(room.lk, 'r', 'b'), false)
      assert.deepEqual(room.muted, [])
    } finally {
      await room.close()
    }
  })
})
