// A viewer's challenge to a review that proposes a change (LFE-07.2, slice 3): why it doesn't hold, sent to the lead as
// context for its next review, never a veto. Kept by review and viewer while the page lives (page-memory.ts): its draft,
// so closing the card loses nothing, and its key, so a challenge not confirmed is sent again with the same one and can't
// be sent twice. Its words are then locked: the same key must carry the same words.
import { pageMemory, useMemory } from './page-memory.ts'
import type { LastReview } from './review.ts'

/** What came back for a challenge: recorded, refused as not the sender's to make, or not confirmed. */
export type ChallengeOutcome = 'recorded' | 'denied' | 'unknown'

/** Where the lead's port sends it (proposed for SCM-04: a context_update caused by the review's command). */
export type Challenge = (review: LastReview, text: string, key: string) => Promise<ChallengeOutcome>

export interface Challenged {
  text: string
  /** Drawn when first sent; empty while a draft. */
  key: string
  state: 'draft' | 'sending' | ChallengeOutcome
}

const challenges = pageMemory<Challenged>()

/** One review, as one viewer challenged it: each field whole, no viewer apart from "anyone" (Codex F-037). */
export const challengeKey = (reviewId: string, viewerId: string | null) => JSON.stringify([reviewId, viewerId])

export const challengeOf = (key: string): Challenged | null => challenges.get(key)

export const setChallenge = (key: string, value: Challenged): void => challenges.set(key, value)

export const useChallenge = (key: string) => useMemory(challenges, key)

/** Its words can change only while a draft: once sent, a retry must carry the same words under the same key. */
export const editable = (c: Challenged | null) => !c || c.state === 'draft'

/** Whether it can be sent now: a draft with words, or one not confirmed (again, as it was). */
export const sendable = (c: Challenged | null) =>
  c !== null && c.text.trim() !== '' && (c.state === 'draft' || c.state === 'unknown')

/** The key to send with: the same one again while not confirmed; otherwise a new one. */
export const keyFor = (c: Challenged, draw: () => string) => (c.state === 'unknown' && c.key ? c.key : draw())

export const SAID: Record<Exclude<Challenged['state'], 'draft'>, string> = {
  sending: 'Sending your challenge…',
  recorded: 'Sent to the lead, for its next review.',
  unknown: 'Not confirmed. Sending again repeats the same request.',
  denied: 'Only editors and admins can challenge a review.',
}
