// What settles a review's press, and where a recorded record goes in a newest-first list (docs/plans/room-follow-ups-3.md).
// Pure, so the units test it.
import type { ReviewAsk, VersionReview } from '../../api/vision.ts'

/**
 * Whether the reviews new since a press settle it. A refusal gives way to any. A press with no reply only to the
 * evidence that it landed: a new review of mine with its verdict and its words. Another member's, or another device's
 * with other words, says nothing of it.
 */
export function reviewSettled(
  status: string,
  ask: ReviewAsk,
  fresh: readonly VersionReview[],
  me: string | undefined,
): boolean {
  if (status === 'rejected') return fresh.length > 0
  if (status !== 'unknown') return false
  return fresh.some((r) => r.by === me && r.verdict === ask.verdict && (r.note ?? null) === (ask.note ?? null))
}

/** A record into a newest-first list by its time, once: a late reply never goes above a newer record. */
export function byTime<T extends { at: string }>(list: readonly T[], item: T, id: (t: T) => string): T[] {
  const rest = list.filter((t) => id(t) !== id(item))
  const when = Date.parse(item.at)
  const at = rest.findIndex((t) => Date.parse(t.at) < when)
  return at < 0 ? [...rest, item] : [...rest.slice(0, at), item, ...rest.slice(at)]
}
