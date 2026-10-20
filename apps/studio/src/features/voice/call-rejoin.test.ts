import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CALL_END, OFFLINE_REJOIN, REJOINED, REJOINING } from './call-end.ts'
import {
  LIVE_BEAT_MS,
  RECONNECT_DELAYS_MS,
  Rejoin,
  REJOIN_WINDOW_MS,
  REJOINED_FOR_MS,
  TRY_FRESH_MS,
  rejoinLine,
  rejoinPlan,
  stillSeen,
  type RejoinStep,
} from './call-rejoin.ts'

const MIN = 60_000
const dropped = { why: 'dropped' as const, online: true, now: 10 * MIN, seen: 10 * MIN - 50_000, triedAt: null }

describe('when a call that ended tries to come back on its own (call-rejoin.md)', () => {
  it('a lost connection tries at once online, and once the browser is online again offline', () => {
    assert.equal(rejoinPlan(dropped), 'now')
    assert.equal(rejoinPlan({ ...dropped, online: false }), 'online')
  })

  it('never after leaving, another tab or browser, being taken out, or a closed room', () => {
    for (const why of [null, 'elsewhere', 'removed', 'closed'] as const) {
      assert.equal(rejoinPlan({ ...dropped, why }), null, String(why))
      assert.equal(rejoinPlan({ ...dropped, why, online: false }), null, String(why))
    }
  })

  it('never for a call last seen live more than two minutes ago: the page slept, or LiveKit tried that long', () => {
    assert.equal(REJOIN_WINDOW_MS, 2 * MIN)
    assert.equal(rejoinPlan({ ...dropped, seen: dropped.now - REJOIN_WINDOW_MS }), 'now', 'the edge still tries')
    assert.equal(rejoinPlan({ ...dropped, seen: dropped.now - REJOIN_WINDOW_MS - 1 }), null)
    assert.equal(rejoinPlan({ ...dropped, seen: null }), null, 'never seen live')
  })

  it('once for one drop: none within two minutes of the last try, so a flapping network is left to the person', () => {
    assert.equal(rejoinPlan({ ...dropped, triedAt: dropped.now - 30_000 }), null)
    assert.equal(rejoinPlan({ ...dropped, online: false, triedAt: dropped.now - 30_000 }), null)
    assert.equal(rejoinPlan({ ...dropped, triedAt: dropped.now - REJOIN_WINDOW_MS }), 'now', 'a later drop tries again')
  })

  it('is seen live on each beat while the page runs, and stays as old as it was after any longer gap (review P3)', () => {
    assert.equal(LIVE_BEAT_MS, 5000)
    assert.equal(stillSeen(1000, 1000 + LIVE_BEAT_MS), 1000 + LIVE_BEAT_MS)
    assert.equal(stillSeen(1000, 1000 + 2 * LIVE_BEAT_MS), 1000 + 2 * LIVE_BEAT_MS, 'one beat late still counts')
    assert.equal(stillSeen(1000, 1000 + 2 * LIVE_BEAT_MS + 1), 1000, 'the page didn’t run in between')
    assert.equal(stillSeen(1000, 1000 + 60_000), 1000, 'a minute without a beat is a page asleep, not a live call')
    assert.equal(stillSeen(null, 5000), null)
  })

  it('says each step in one plain line, and nothing when none waits or runs', () => {
    assert.equal(rejoinLine('trying'), 'Connection lost. Rejoining the call…')
    assert.equal(
      rejoinLine('waiting'),
      'You’re offline, so the call ended here. Back online, you rejoin it automatically.',
    )
    assert.equal(rejoinLine('back'), 'Reconnected.')
    assert.equal(rejoinLine(null), null)
  })

  it('pins LiveKit’s own tries, all of them inside the window with their jitter, so a drop still comes back', () => {
    assert.deepEqual(RECONNECT_DELAYS_MS, [0, 300, 1200, 2700, 4800, 7000, 7000, 7000, 7000, 7000])
    const longest = RECONNECT_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) + (RECONNECT_DELAYS_MS.length - 2) * 1000
    assert.ok(longest < REJOIN_WINDOW_MS / 2, `${String(longest)} ms of LiveKit's own waiting`)
  })
})

/** The room and person of the call the harness drops: what the tabs' claims are scoped by. */
const SCOPE = 'room-1:actor-1'

/** The promises already answered have run their callbacks. */
const settle = () => new Promise<void>((done) => setTimeout(done, 0))

/** The browser, the clock and the room, in the check's hands. */
function harness(online = true) {
  const t = {
    now: 10 * MIN,
    online,
    /** Another tab of this browser holds the call. */
    elsewhere: false,
    /** The next join rejects instead of answering. */
    throws: false,
    back: [] as (() => void)[],
    timers: [] as { at: number; run: () => void }[],
  }
  const said: string[] = []
  /** What this room told the other tabs, as `scope state`. */
  const claims: string[] = []
  const shown: (RejoinStep | null)[] = []
  const joins: ((inCall: boolean) => void)[] = []
  /** Each try's gate, asked right before it connects. */
  const stills: ((() => boolean) | undefined)[] = []
  const rejoin = new Rejoin({
    join: (still?: () => boolean) =>
      new Promise<boolean>((answer, refuse) => {
        joins.push(answer)
        stills.push(still)
        if (t.throws) refuse(new Error('the join threw'))
      }),
    say: (note) => said.push(note),
    show: (step) => shown.push(step),
    now: () => t.now,
    online: () => t.online,
    held: (scope: string) => t.elsewhere && scope === SCOPE,
    claim: (scope: string, state: 'joining' | 'in' | null) => claims.push(`${scope} ${state ?? 'out'}`),
    whenOnline: (back) => {
      t.back.push(back)
      return () => {
        t.back = t.back.filter((b) => b !== back)
      }
    },
    after: (ms, run) => {
      const timer = { at: t.now + ms, run }
      t.timers.push(timer)
      return () => {
        t.timers = t.timers.filter((x) => x !== timer)
      }
    },
  })
  rejoin.scoped(SCOPE)
  return {
    rejoin,
    claims,
    said,
    shown,
    joins,
    stills,
    /** The clock moves on, and every timer due runs. */
    pass: (ms: number) => {
      t.now += ms
      const due = t.timers.filter((x) => x.at <= t.now)
      t.timers = t.timers.filter((x) => x.at > t.now)
      for (const x of due) x.run()
    },
    /** The clock moves on and no timer runs. */
    jump: (ms: number) => {
      t.now += ms
    },
    /** The browser comes back online. */
    reconnect: () => {
      t.online = true
      const back = t.back
      t.back = []
      for (const b of back) b()
    },
    goOffline: () => {
      t.online = false
    },
    /** The joins from now on reject. */
    joinsThrow: () => {
      t.throws = true
    },
    /** Another tab of this browser joins the call, or leaves it. */
    otherTab: (inCall: boolean) => {
      t.elsewhere = inCall
    },
    listening: () => t.back.length,
  }
}

describe('one try back into a dropped call', () => {
  it('online, joins at once and says so; back in, says it once, then nothing', async () => {
    const h = harness()
    h.rejoin.live()
    h.pass(40_000)
    h.rejoin.ended('dropped')
    assert.equal(h.joins.length, 1, 'one join, as Try again presses it')
    assert.deepEqual(h.shown, ['trying'])
    h.joins[0]?.(true)
    await settle()
    assert.deepEqual(h.shown, ['trying', 'back'])
    h.pass(REJOINED_FOR_MS)
    assert.deepEqual(h.shown, ['trying', 'back', null])
    assert.deepEqual(h.said, [])
  })

  it('a try that fails says the lost call’s words once and tries no more', async () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.joins[0]?.(false)
    await settle()
    assert.deepEqual(h.shown, ['trying', null])
    assert.deepEqual(h.said, [CALL_END.dropped.note])
    h.pass(REJOIN_WINDOW_MS)
    assert.equal(h.joins.length, 1)
  })

  it('a call that drops again right after its try came back is left to the person', async () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.joins[0]?.(true)
    await settle()
    h.rejoin.live()
    h.pass(2_000)
    h.rejoin.ended('dropped')
    assert.equal(h.joins.length, 1)
    assert.equal(h.shown.at(-1), null, '«Reconnected.» goes with the call')
  })

  it('a drop well after the last try tries again', async () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.joins[0]?.(true)
    await settle()
    for (let beat = 0; beat < 40; beat += 1) {
      h.pass(LIVE_BEAT_MS)
      h.rejoin.beat()
    }
    h.rejoin.ended('dropped')
    assert.equal(h.joins.length, 2)
  })

  it('never after leaving, another tab, being taken out or a closed room', () => {
    for (const why of [null, 'elsewhere', 'removed', 'closed'] as const) {
      const h = harness()
      h.rejoin.live()
      h.rejoin.ended(why)
      assert.equal(h.joins.length, 0, String(why))
      assert.deepEqual(h.shown, [], String(why))
    }
  })

  it('never for a page that slept past the window while the call was live', () => {
    const h = harness()
    h.rejoin.live()
    h.pass(60 * MIN)
    h.rejoin.beat()
    h.pass(LIVE_BEAT_MS)
    h.rejoin.beat()
    h.rejoin.ended('dropped')
    assert.equal(h.joins.length, 0)
  })

  it('offline, waits for the network, once, then tries once', async () => {
    const h = harness(false)
    h.rejoin.live()
    h.rejoin.ended('dropped')
    assert.deepEqual(h.shown, ['waiting'])
    assert.equal(h.joins.length, 0, 'nothing is asked offline')
    h.pass(20_000)
    h.reconnect()
    assert.equal(h.joins.length, 1)
    assert.deepEqual(h.shown, ['waiting', 'trying'])
    assert.equal(h.listening(), 0, 'it listens no more')
    h.joins[0]?.(true)
    await settle()
    assert.equal(h.shown.at(-1), 'back')
  })

  it('offline past the window, the wait ends where it is, and the network coming back joins nothing', () => {
    const h = harness(false)
    h.rejoin.live()
    h.pass(30_000)
    h.rejoin.ended('dropped')
    h.pass(REJOIN_WINDOW_MS)
    assert.deepEqual(h.shown, ['waiting', null])
    assert.equal(h.listening(), 0)
    h.reconnect()
    assert.equal(h.joins.length, 0)
  })

  it('back online past the window before its timer ran (a page that slept offline), joins nothing', () => {
    const h = harness(false)
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.jump(REJOIN_WINDOW_MS + 1) // the clock moves on while no timer runs, as a page asleep finds it on waking
    h.reconnect()
    assert.equal(h.joins.length, 0)
    assert.deepEqual(h.shown, ['waiting', null])
  })

  it('Leave stops a try under way: its late answer changes nothing', async () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    assert.equal(h.rejoin.stop(), true, 'something was stopped')
    assert.deepEqual(h.shown, ['trying', null])
    h.joins[0]?.(true)
    await settle()
    assert.deepEqual(h.shown, ['trying', null])
    assert.deepEqual(h.said, [])
  })

  it('Leave stops a wait for the network: back online, nothing joins', () => {
    const h = harness(false)
    h.rejoin.live()
    h.rejoin.ended('dropped')
    assert.equal(h.rejoin.stop(), true)
    assert.equal(h.listening(), 0)
    h.reconnect()
    assert.equal(h.joins.length, 0)
  })

  it('Leave with nothing waiting stops nothing', () => {
    const h = harness()
    assert.equal(h.rejoin.stop(), false)
    assert.deepEqual(h.shown, [])
  })

  it('a try that fails offline says the lost call too: the room keeps it as its offline line (keptNote)', async () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.goOffline()
    h.joins[0]?.(false)
    await settle()
    assert.deepEqual(h.said, [CALL_END.dropped.note])
  })
})

describe('a try that would connect late, or for a page leaving (review P2)', () => {
  it('a call LiveKit left itself (CLIENT_INITIATED: the page leaving or freezing) never tries', () => {
    assert.equal(rejoinPlan({ ...dropped, selfLeft: true }), null)
    assert.equal(rejoinPlan({ ...dropped, online: false, selfLeft: true }), null)
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped', true)
    assert.equal(h.joins.length, 0)
    assert.deepEqual(h.shown, [])
  })

  it('connects only while the try is young and the call recent: a token that came back late goes no further', () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    const still = h.stills[0]
    assert.ok(still, 'the try hands its join a gate')
    assert.equal(still(), true)
    h.jump(TRY_FRESH_MS)
    assert.equal(still(), true, 'the edge still connects')
    h.jump(1)
    assert.equal(still(), false, 'a page frozen with the token on its way, woken later')
  })

  it('a try stopped by Leave never connects, even if its token comes', () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.rejoin.stop()
    assert.equal(h.stills[0]?.(), false)
  })

  it('a try made after an offline wait connects only while the call is still recent', () => {
    const h = harness(false)
    h.rejoin.live()
    h.pass(100_000)
    h.rejoin.ended('dropped')
    h.reconnect()
    assert.equal(h.stills[0]?.(), true)
    h.jump(REJOIN_WINDOW_MS - 100_000 + 1)
    assert.equal(h.stills[0]?.(), false, 'past the window, even inside the try’s own 30 s')
  })
})

describe('a try never takes the call from another tab of this browser (review P2, seam #3)', () => {
  it('never tries while another tab holds the call', () => {
    assert.equal(rejoinPlan({ ...dropped, elsewhere: true }), null)
    const h = harness()
    h.rejoin.live()
    h.otherTab(true)
    h.rejoin.ended('dropped')
    assert.equal(h.joins.length, 0)
  })

  it('offline, another tab that joined meanwhile is left with the call once the network is back', () => {
    const h = harness(false)
    h.rejoin.live()
    h.rejoin.ended('dropped')
    h.otherTab(true)
    h.reconnect()
    assert.equal(h.joins.length, 0)
    assert.equal(h.shown.at(-1), null)
  })

  it('a try under way goes no further once another tab joins', () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    assert.equal(h.stills[0]?.(), true)
    h.otherTab(true)
    assert.equal(h.stills[0]?.(), false)
  })
})

describe('what this room tells the other tabs, and a clock set back (review round 2)', () => {
  it('says it is joining, in the call and out, for its room and person', () => {
    const h = harness()
    h.rejoin.status('joining')
    h.rejoin.status('live')
    h.rejoin.status('failed')
    assert.deepEqual(h.claims.slice(-3), [`${SCOPE} joining`, `${SCOPE} in`, `${SCOPE} out`])
  })

  it('a try says it is joining before its token is asked for, so a tab joining meanwhile sees it', () => {
    const h = harness()
    h.rejoin.status('live')
    h.rejoin.live()
    h.rejoin.status('failed')
    h.rejoin.ended('dropped')
    assert.equal(h.claims.at(-1), `${SCOPE} joining`)
  })

  it('a try that fails with no status move says it joins no more (a join held offline, or none possible)', async () => {
    const h = harness()
    h.rejoin.status('live')
    h.rejoin.live()
    h.rejoin.status('failed')
    h.rejoin.ended('dropped')
    assert.equal(h.claims.at(-1), `${SCOPE} joining`)
    h.joins[0]?.(false)
    await settle()
    assert.equal(h.claims.at(-1), `${SCOPE} out`)
  })

  it('a call seen live «later» than now (a clock set back) is not recent', () => {
    assert.equal(rejoinPlan({ ...dropped, seen: dropped.now + 60_000 }), null)
  })

  it('a try whose clock went back before it began is stale', () => {
    const h = harness()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    assert.equal(h.stills[0]?.(), true)
    h.jump(-60_000)
    assert.equal(h.stills[0]?.(), false)
  })
})

describe('a try whose join throws (review P3)', () => {
  it('is a failed try: the lost call is said, and nothing more is tried', async () => {
    const h = harness()
    h.joinsThrow()
    h.rejoin.live()
    h.rejoin.ended('dropped')
    await settle()
    assert.deepEqual(h.shown, ['trying', null])
    assert.deepEqual(h.said, [CALL_END.dropped.note])
  })
})

describe('the lines are the room’s own', () => {
  it('match call-end.ts', () => {
    assert.equal(rejoinLine('trying'), REJOINING)
    assert.equal(rejoinLine('waiting'), OFFLINE_REJOIN)
    assert.equal(rejoinLine('back'), REJOINED)
  })
})
