// Where there is room when an account runs short (LFE-06.5): another online resource whose percentage window is under
// the warning line and on pace, its owner's own first, then the emptiest. It only shows: moving work is the lead's
// (LFE-07.3), and nothing here assigns.
import {
  capacity,
  FULL_AT,
  observationOf,
  TOOL,
  WARN_AT,
  type Capacity,
  type QuotaObservation,
  type Resource,
} from './resource.ts'

/** Whether a capacity is short: it runs out before it resets, or it is past the full line already. */
export const short = (c: Capacity) => Boolean(c.pace?.runsOut) || (c.limiting?.percent ?? 0) >= FULL_AT

/**
 * A short capacity in a few words, after "Its account": "runs out in ~34 min", "runs out now", or past the full line,
 * "is at 92% of its 5-hour window"; null when it isn't short.
 */
export function shortWords(c: Capacity): string | null {
  const out = c.pace?.runsOut
  if (out) return out === 'now' ? 'runs out now' : `runs out in ${out}`
  const { limiting } = c
  if (!limiting?.percent || limiting.percent < FULL_AT) return null
  return `is at ${String(limiting.percent)}% of its ${limiting.name} window`
}

/** The same, short enough for a task's tile, after "Account": "out in ~34 min", "out now", "at 92%"; else null. */
export function shortTileWords(c: Capacity): string | null {
  const out = c.pace?.runsOut
  if (out) return out === 'now' ? 'out now' : `out in ${out}`
  const percent = c.limiting?.percent
  return percent && percent >= FULL_AT ? `at ${String(percent)}%` : null
}

export interface Room {
  resource: Resource
  /** "Davide's Codex has room: 5-hour at 42%". */
  line: string
}

/** The capacity of a resource's account, from the latest observations. */
export const capacityOf = (r: Resource, observations: readonly QuotaObservation[], now: Date) =>
  capacity(observationOf(observations, r), now)

/** When `from` runs short, a resource with room, other than it and not on its account; null otherwise. */
export function roomElsewhere(
  from: Resource,
  resources: readonly Resource[],
  observations: readonly QuotaObservation[],
  now: Date,
  viewerId: string,
): Room | null {
  if (!short(capacityOf(from, observations, now))) return null
  const roomy = resources
    .filter((r) => r.id !== from.id && r.entitlementId !== from.entitlementId && r.host.state === 'online')
    .map((r) => ({ r, c: capacityOf(r, observations, now) }))
    .filter(({ c }) => (c.limiting?.percent ?? 100) < WARN_AT && !c.pace?.runsOut)
    .toSorted(
      (a, b) =>
        Number(b.r.owner.id === from.owner.id) - Number(a.r.owner.id === from.owner.id) ||
        (a.c.limiting?.percent ?? 0) - (b.c.limiting?.percent ?? 0),
    )
  const best = roomy[0]
  if (!best?.c.limiting) return null
  const whose = best.r.owner.id === viewerId ? 'Your' : `${best.r.owner.name}’s`
  const at = `${best.c.limiting.name} at ${String(best.c.limiting.percent)}%`
  return { resource: best.r, line: `${whose} ${TOOL[best.r.tool]} has room: ${at}` }
}
