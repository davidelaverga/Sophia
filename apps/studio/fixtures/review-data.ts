// A version's reviews (room-review checks), answered as the proposed A16 has them (issue #105): newest first, each
// recorded once per Idempotency-Key, a reply lost when the page asks for that. Every word is synthetic.
import type { ReviewAsk, VersionReview } from '../src/api/vision.ts'

export interface Reviews {
  byVersion: Map<string, VersionReview[]>
  byKey: Map<string, VersionReview>
  /** The next review lands, but its reply is lost on the way (`window.fixture.loseNextReviewReply`). */
  loseReply: boolean
  /** The next review never reaches the API: the connection fails before it (`window.fixture.dropNextReview`). */
  drop: boolean
}

export const noReviews = (): Reviews => ({ byVersion: new Map(), byKey: new Map(), loseReply: false, drop: false })

const isAsk = (value: unknown): value is ReviewAsk =>
  typeof value === 'object' &&
  value !== null &&
  'verdict' in value &&
  (value.verdict === 'approved' || (value.verdict === 'changes_requested' && 'note' in value))

/** A review of `versionId` by `by`, kept under its key: the same key again replays it. Null for a body that is none. */
export function reviewed(reviews: Reviews, versionId: string, by: string, key: string, body: unknown) {
  // A key is the intent's on this version: the same key on another version is another request.
  const keyed = `${versionId} ${key}`
  const replayed = reviews.byKey.get(keyed)
  if (replayed) return { review: replayed, first: false }
  const ask: unknown = typeof body === 'string' ? JSON.parse(body) : null
  if (!isAsk(ask)) return null
  const review: VersionReview = {
    reviewId: `00000000-0000-4000-8000-${String(reviews.byKey.size + 1).padStart(12, '0')}`,
    verdict: ask.verdict,
    note: ask.note ?? null,
    by,
    at: new Date().toISOString(),
  }
  reviews.byKey.set(keyed, review)
  reviews.byVersion.set(versionId, [review, ...(reviews.byVersion.get(versionId) ?? [])])
  return { review, first: true }
}
