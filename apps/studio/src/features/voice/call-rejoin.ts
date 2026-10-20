// One automatic way back into a call whose connection dropped (docs/plans/call-rejoin.md): whether it is tried, when,
// and what the room says meanwhile. The rule is pure and the try runs on ports, so both are unit-tested;
// useProjectRoom's useRejoin gives it the room's join, the browser's clock and its `online`.
import { CALL_END, OFFLINE_REJOIN, REJOINED, REJOINING, type CallEnd } from './call-end.ts'
import type { ClaimState } from './call-tabs.ts'
import type { DockStatus } from './room-view.ts'

/**
 * LiveKit's own reconnect policy, written out: livekit-client 2.22.3's DefaultReconnectPolicy defaults, ten tries over
 * about 44 s (up to 1 s of jitter added from the third). Pinned so an upgrade can't change how long a cut call waits
 * before it ends as `dropped` without a diff here (livekit-room.ts).
 */
export const RECONNECT_DELAYS_MS: readonly number[] = [0, 300, 1200, 2700, 4800, 7000, 7000, 7000, 7000, 7000]

/** How long after a call was last seen live its drop still tries on its own; also the least time between two tries. */
export const REJOIN_WINDOW_MS = 120_000

/** How often a live call is seen live: a page that isn't running (a closed lid, a frozen tab) sees nothing meanwhile. */
export const LIVE_BEAT_MS = 5000

/**
 * How long the beats must come on time, with LiveKit connected, after a gap before the call is seen live again: twice
 * LiveKit's pong timeout (the server's `pingTimeout`, 15 s), which is past due after a longer gap and fires as the page
 * wakes, so a link that died meanwhile has LiveKit reconnecting, or resuming its signal while the dock still reads live,
 * before this run is over; a beat then isn't connected and starts the run again.
 */
export const STEADY_MS = 30_000

/** How long after a try began it may still connect: a token that comes back later (a page frozen meanwhile) doesn't. */
export const TRY_FRESH_MS = 30_000

/** How long «Reconnected.» stays said. */
export const REJOINED_FOR_MS = 4000

/** Where the try stands: waiting for the network, under way, or just back in. */
export type RejoinStep = 'waiting' | 'trying' | 'back'

/** A call that ended, as the rule reads it. */
export interface Drop {
  why: CallEnd | null
  online: boolean
  now: number
  /** When the call was last seen live (ms), or never. */
  seen: number | null
  /** When the last try began (ms), or never. */
  triedAt: number | null
  /** LiveKit left the room itself (CLIENT_INITIATED): the page leaving or freezing, not a lost link. */
  selfLeft?: boolean
  /** Another tab of this browser holds the call (call-tabs.ts). */
  elsewhere?: boolean
}

/** Whether a call last seen live at `seen` is still recent enough to come back on its own; a clock set back isn't. */
export const withinWindow = (seen: number | null, now: number): boolean =>
  seen !== null && now >= seen && now - seen <= REJOIN_WINDOW_MS

/**
 * After a call ends: try now, try once the browser is online, or never. Only a lost connection tries: leaving, another
 * tab or browser, being taken out and a closed room are over, and so is a room LiveKit left itself as the page left or
 * froze. Never while another tab of this browser holds the call (the person moved there). Never for a call last seen
 * live too long ago (the page slept, or LiveKit tried that long), and never within the window of the last try: one try
 * for one drop, and none for a network that keeps dropping.
 */
export function rejoinPlan(drop: Drop): 'now' | 'online' | null {
  if (drop.why !== 'dropped' || drop.selfLeft || drop.elsewhere || !withinWindow(drop.seen, drop.now)) return null
  if (drop.triedAt !== null && drop.now - drop.triedAt < REJOIN_WINDOW_MS) return null
  return drop.online ? 'now' : 'online'
}

/** A call as its beats see it: when last seen live, when the last beat came, and since when they come on time. */
export interface Liveness {
  seen: number | null
  beat: number | null
  /** When the run of beats on time after the last gap began; null when none has come since the call went live. */
  since: number | null
}

/** The call went live: a join, or LiveKit's own reconnect, which says the link works. */
export const liveAt = (now: number): Liveness => ({ seen: now, beat: now, since: null })

/**
 * A beat while the call is live, compared with the beat before. More than two beats after it (or a clock set back), the
 * page wasn't running in between (asleep, frozen, throttled): the call stays as old as it was, and a run begins; so
 * does a beat while LiveKit isn't `connected` (resuming its signal, reconnecting). It is seen now while no gap came
 * since it went live, or once the run has lasted `STEADY_MS`.
 */
export function stillSeen(live: Liveness, now: number, connected = true): Liveness {
  const { seen, beat, since } = live
  if (seen === null || beat === null) return live
  if (!connected || now < beat || now - beat > 2 * LIVE_BEAT_MS) return { seen, beat: now, since: now }
  if (since === null || now - since >= STEADY_MS) return liveAt(now)
  return { seen, beat: now, since }
}

const LINES: Record<RejoinStep, string> = { waiting: OFFLINE_REJOIN, trying: REJOINING, back: REJOINED }

/** What the room says of the try, in place of its note; nothing when none waits, runs or just came back. */
export const rejoinLine = (step: RejoinStep | null): string | null => (step === null ? null : LINES[step])

/** What a try needs from the room and the browser. */
export interface RejoinPorts {
  /**
   * The room's join, as Try again presses it: resolves to whether this person is in the call. `still` is asked right
   * before it connects; false ends it there, as a failed join.
   */
  join: (still: () => boolean) => Promise<boolean>
  /** The room's note: the lost call's words again once the try failed. */
  say: (note: string) => void
  /** What the room shows of the try. */
  show: (step: RejoinStep | null) => void
  now: () => number
  online: () => boolean
  /** Whether another tab of this browser holds the call `scope` (the LiveKit room and the person), or joins it. */
  held: (scope: string) => boolean
  /** Tells this browser's other tabs where this room stands in the call `scope` (call-tabs.ts). */
  claim: (scope: string, state: ClaimState | null) => void
  /** Calls `back` once the browser is online again; returns how to stop listening. */
  whenOnline: (back: () => void) => () => void
  /** Calls `run` after `ms`; returns how to cancel it. */
  after: (ms: number, run: () => void) => () => void
}

const nothing = () => undefined

/**
 * One room's tries back in. Told when its call goes live and while it stays live (`live`, `beat`), and when it ends
 * (`ended`); `stop` ends whatever waits or runs (Leave, the room going away). An answer to a try that was stopped, or
 * whose call ended again, changes nothing (`round`).
 */
export class Rejoin {
  private readonly ports: RejoinPorts
  private step: RejoinStep | null = null
  private liveness: Liveness = { seen: null, beat: null, since: null }
  private triedAt: number | null = null
  private round = 0
  private cancel: () => void = nothing
  /** The call this room was in or joins (the LiveKit room and the person), once a token named it; and where it stands. */
  private scope: string | null = null
  private standing: ClaimState | null = null

  constructor(ports: RejoinPorts) {
    this.ports = ports
  }

  /** The room's token named the call: its LiveKit room and the person in it. */
  scoped(scope: string): void {
    this.scope = scope
    this.claim(this.standing)
  }

  /** The room's status moved: told to the other tabs (joining, in the call, or out), and a live call is seen now. */
  status(status: DockStatus): void {
    if (status === 'live') this.live()
    const inCall = status === 'live' || status === 'reconnecting'
    this.claim(status === 'joining' ? 'joining' : inCall ? 'in' : null)
  }

  private claim(state: ClaimState | null): void {
    this.standing = state
    if (this.scope !== null) this.ports.claim(this.scope, state)
  }

  /** Whether another tab of this browser holds this room's call, or joins it. */
  private elsewhere(): boolean {
    return this.scope !== null && this.ports.held(this.scope)
  }

  /** The call went live: a join, or LiveKit's own reconnect. */
  live(): void {
    this.liveness = liveAt(this.ports.now())
  }

  /** A beat while the call is live (stillSeen); `connected`: LiveKit reads the room connected. */
  beat(connected = true): void {
    this.liveness = stillSeen(this.liveness, this.ports.now(), connected)
  }

  /** When the call was last seen live. */
  private get seen(): number | null {
    return this.liveness.seen
  }

  /**
   * The call ended, `why` as call-end.ts says it (`selfLeft`: LiveKit left the room itself): one try now, one once the
   * browser is online, or none.
   */
  ended(why: CallEnd | null, selfLeft = false): void {
    this.stop()
    const { now, online } = this.ports
    const at = { why, online: online(), now: now(), seen: this.seen, triedAt: this.triedAt }
    const plan = rejoinPlan({ ...at, selfLeft, elsewhere: this.elsewhere() })
    if (plan === 'now') this.tryOnce()
    if (plan === 'online') this.waitForNetwork()
  }

  /** Whatever waits or runs stops, and the room says nothing more of it; true when a try waited or ran. */
  stop(): boolean {
    const stopped = this.step === 'waiting' || this.step === 'trying'
    this.round += 1
    this.cancel()
    this.cancel = nothing
    if (this.step !== null) this.show(null)
    return stopped
  }

  private show(step: RejoinStep | null): void {
    this.step = step
    this.ports.show(step)
  }

  /**
   * The try: the room's join, connecting only while the try is young and the call recent (a page frozen with the token
   * on its way wakes past both), never once stopped, and never once another tab of this browser holds the call.
   */
  private tryOnce(): void {
    const round = this.round
    const triedAt = this.ports.now()
    this.triedAt = triedAt
    this.show('trying')
    // Said before the token is asked for, so a tab joining meanwhile knows of it.
    this.claim('joining')
    // A clock set back since the try began reads as stale too: its age is no longer known.
    const still = () => {
      const now = this.ports.now()
      const fresh = now >= triedAt && now - triedAt <= TRY_FRESH_MS && withinWindow(this.seen, now)
      return round === this.round && fresh && !this.elsewhere()
    }
    // A join that throws is a try that failed, said as one.
    void this.ports
      .join(still)
      .catch(() => false)
      .then((inCall) => {
        if (round !== this.round) return
        if (!inCall) {
          this.show(null)
          // A join that returned with no status move (held offline, none possible) leaves its claim behind: cleared.
          if (this.standing === 'joining') this.claim(null)
          this.ports.say(CALL_END.dropped.note)
          return
        }
        this.show('back')
        this.cancel = this.ports.after(REJOINED_FOR_MS, () => this.show(null))
      })
  }

  /** Offline: one try once the browser is online, while the call is still recent; past that, the wait ends. */
  private waitForNetwork(): void {
    const round = this.round
    const over = () => {
      this.cancel()
      this.cancel = nothing
    }
    this.show('waiting')
    const unlisten = this.ports.whenOnline(() => {
      if (round !== this.round) return
      over()
      if (withinWindow(this.seen, this.ports.now()) && !this.elsewhere()) this.tryOnce()
      else this.show(null)
    })
    const left = (this.seen ?? 0) + REJOIN_WINDOW_MS - this.ports.now()
    const unexpire = this.ports.after(left, () => {
      if (round !== this.round) return
      over()
      this.show(null)
    })
    this.cancel = () => {
      unlisten()
      unexpire()
    }
  }
}
