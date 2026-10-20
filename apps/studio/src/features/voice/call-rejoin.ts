// One automatic way back into a call whose connection dropped (docs/plans/call-rejoin.md): whether it is tried, when,
// and what the room says meanwhile. The rule is pure and the try runs on ports, so both are unit-tested;
// useProjectRoom's useRejoin gives it the room's join, the browser's clock and its `online`.
import { CALL_END, OFFLINE_REJOIN, REJOINED, REJOINING, type CallEnd } from './call-end.ts'

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
}

/** Whether a call last seen live at `seen` is still recent enough to come back on its own. */
export const withinWindow = (seen: number | null, now: number): boolean =>
  seen !== null && now - seen <= REJOIN_WINDOW_MS

/**
 * After a call ends: try now, try once the browser is online, or never. Only a lost connection tries: leaving, another
 * tab or browser, being taken out and a closed room are over. Never for a call last seen live too long ago (the page
 * slept, or LiveKit tried that long), and never within the window of the last try: one try for one drop, and none for
 * a network that keeps dropping.
 */
export function rejoinPlan(drop: Drop): 'now' | 'online' | null {
  if (drop.why !== 'dropped' || !withinWindow(drop.seen, drop.now)) return null
  if (drop.triedAt !== null && drop.now - drop.triedAt < REJOIN_WINDOW_MS) return null
  return drop.online ? 'now' : 'online'
}

/**
 * A beat while the call is live: seen now, unless the last time it was seen is past the window. The page wasn't running
 * meanwhile, so the call stays as old as it was until it goes live again.
 */
export const stillSeen = (seen: number | null, now: number): number | null => (withinWindow(seen, now) ? now : seen)

const LINES: Record<RejoinStep, string> = { waiting: OFFLINE_REJOIN, trying: REJOINING, back: REJOINED }

/** What the room says of the try, in place of its note; nothing when none waits, runs or just came back. */
export const rejoinLine = (step: RejoinStep | null): string | null => (step === null ? null : LINES[step])

/** What a try needs from the room and the browser. */
export interface RejoinPorts {
  /** The room's join, as Try again presses it: resolves to whether this person is in the call. */
  join: () => Promise<boolean>
  /** The room's note: the lost call's words again once the try failed. */
  say: (note: string) => void
  /** What the room shows of the try. */
  show: (step: RejoinStep | null) => void
  now: () => number
  online: () => boolean
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
  private seen: number | null = null
  private triedAt: number | null = null
  private round = 0
  private cancel: () => void = nothing

  constructor(ports: RejoinPorts) {
    this.ports = ports
  }

  /** The call went live: a join, or LiveKit's own reconnect. */
  live(): void {
    this.seen = this.ports.now()
  }

  /** A beat while the call is live (stillSeen). */
  beat(): void {
    this.seen = stillSeen(this.seen, this.ports.now())
  }

  /** The call ended, `why` as call-end.ts says it: one try now, one once the browser is online, or none. */
  ended(why: CallEnd | null): void {
    this.stop()
    const { now, online } = this.ports
    const plan = rejoinPlan({ why, online: online(), now: now(), seen: this.seen, triedAt: this.triedAt })
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

  private tryOnce(): void {
    const round = this.round
    this.triedAt = this.ports.now()
    this.show('trying')
    void this.ports.join().then((inCall) => {
      if (round !== this.round) return
      if (!inCall) {
        this.show(null)
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
      if (withinWindow(this.seen, this.ports.now())) this.tryOnce()
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
