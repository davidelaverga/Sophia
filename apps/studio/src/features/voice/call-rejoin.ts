// One automatic way back into a call whose connection dropped (docs/plans/call-rejoin.md). Written first as its
// checks' outline: every rule says it isn't written yet.
import type { CallEnd } from './call-end.ts'

const NOT_YET = 'call-rejoin.ts: not written yet'

export const RECONNECT_DELAYS_MS: readonly number[] = []
export const REJOIN_WINDOW_MS = 0
export const LIVE_BEAT_MS = 0
export const REJOINED_FOR_MS = 0

export type RejoinStep = 'waiting' | 'trying' | 'back'

export interface Drop {
  why: CallEnd | null
  online: boolean
  now: number
  seen: number | null
  triedAt: number | null
}

export function withinWindow(_seen: number | null, _now: number): boolean {
  throw new Error(NOT_YET)
}

export function rejoinPlan(_drop: Drop): 'now' | 'online' | null {
  throw new Error(NOT_YET)
}

export function stillSeen(_seen: number | null, _now: number): number | null {
  throw new Error(NOT_YET)
}

export function rejoinLine(_step: RejoinStep | null): string | null {
  throw new Error(NOT_YET)
}

export interface RejoinPorts {
  join: () => Promise<boolean>
  say: (note: string) => void
  show: (step: RejoinStep | null) => void
  now: () => number
  online: () => boolean
  whenOnline: (back: () => void) => () => void
  after: (ms: number, then: () => void) => () => void
}

export class Rejoin {
  constructor(_ports: RejoinPorts) {
    throw new Error(NOT_YET)
  }

  live(): void {
    throw new Error(NOT_YET)
  }

  beat(): void {
    throw new Error(NOT_YET)
  }

  ended(_why: CallEnd | null): void {
    throw new Error(NOT_YET)
  }

  stop(): boolean {
    throw new Error(NOT_YET)
  }
}
