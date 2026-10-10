// A source review's proposal whose outcome is unknown (WBC-02; Codex's automatic review of 1acb1efa, P2), kept beyond
// the form that sent it. Review sources held the proposal's key and its request in the component's state, so leaving
// Tasks or reloading the page lost them, and the next press minted a new key: a proposal Sophia had recorded, its
// answer lost, could be proposed a second time. Here it is kept while the tab lives (session storage, and this page's
// memory where storage is refused), per viewer, project and goal, until Sophia answers it: proposed, or a definite
// refusal. Until then it is the proposal that form sends again, its key and its request unchanged. Only the key and
// the request are kept, and another viewer's, project's or goal's proposal never meets this one. The viewer is their
// account (accountOf: its token's subject), never their email, which the account can change while one is unanswered
// (Codex's automatic review of 06bf6229, P2).
import type { SourceReviewProposalRequest } from '@sophia/contracts'
import type { AuthState } from '../../../app/auth.ts'
import { accountOf } from '../../../app/auth-callback.ts'

/** Whose proposal, where: the viewer (their account, `proposalViewer`), the project and the goal. */
export interface ProposalAt {
  viewer: string
  project: string
  goal: string
}

/** One proposal as sent: its key and its whole request. */
export interface Asked {
  readonly key: string
  readonly request: SourceReviewProposalRequest
}

/** What the form is at: a proposal being sent or unanswered keeps its key and its request. */
export type Sent =
  | { state: 'idle' }
  | ({ state: 'sending' } & Asked)
  | { state: 'proposed' }
  | { state: 'refused'; said: string }
  | ({ state: 'unanswered'; said: string } & Asked)

/** What a proposal found again after leaving Tasks or reloading says: Sophia may already have it. */
export const EARLIER =
  'An earlier proposal may already be recorded. Propose again to check; it is the same proposal, never a second one.'

const PREFIX = 'sophia.review.proposal.v1:'

/** Where a proposal is kept: its viewer, project and goal, each whole (JSON), so no two scopes share a key. */
export const proposalKey = (at: ProposalAt) => `${PREFIX}${JSON.stringify([at.viewer, at.project, at.goal])}`

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const strings = (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string')

/** A kept proposal, and this goal's: anything else under the key (another shape, another goal) is not one. */
function isAsked(value: unknown, at: ProposalAt): value is Asked {
  if (!isRecord(value) || typeof value.key !== 'string' || value.key === '' || !isRecord(value.request)) return false
  const r = value.request
  return (
    r.goalId === at.goal &&
    typeof r.goalRevision === 'number' &&
    strings(r.sourceIds) &&
    typeof r.allowanceUsd === 'number' &&
    (r.purpose === undefined || typeof r.purpose === 'string') &&
    (r.criterionIds === undefined || strings(r.criterionIds))
  )
}

/** The proposal kept under `raw`, if it is this goal's. */
function readKept(raw: string | null | undefined, at: ProposalAt): Asked | null {
  const kept: unknown = raw ? JSON.parse(raw) : null
  return isAsked(kept, at) ? kept : null
}

/** What keeping needs of a storage. */
type Kept = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

const isKept = (value: unknown): value is Kept =>
  isRecord(value) &&
  typeof value.getItem === 'function' &&
  typeof value.setItem === 'function' &&
  typeof value.removeItem === 'function' &&
  typeof value.key === 'function' &&
  typeof value.length === 'number'

/** The tab's session storage, or none where there is none or the browser refuses it. */
function session(): Kept | null {
  try {
    const found: unknown = Reflect.get(globalThis, 'sessionStorage')
    return isKept(found) ? found : null
  } catch {
    return null
  }
}

/** The proposals kept: in `storage` while the tab lives, and in this page's memory where storage is refused. */
export class Proposals {
  readonly #memory = new Map<string, Asked>()
  readonly #storage: () => Kept | null

  constructor(storage = session) {
    this.#storage = storage
  }

  /** The proposal still unanswered here, if any. */
  pending(at: ProposalAt): Asked | null {
    const key = proposalKey(at)
    try {
      const kept = readKept(this.#storage()?.getItem(key), at)
      if (kept) return kept
    } catch {
      // Unreadable: this page's memory, if it holds one.
    }
    return this.#memory.get(key) ?? null
  }

  /** Keep a proposal before it is sent: a page that goes, or reloads, before Sophia answers finds it. */
  keep(at: ProposalAt, asked: Asked): void {
    const key = proposalKey(at)
    this.#memory.set(key, asked)
    try {
      this.#storage()?.setItem(key, JSON.stringify(asked))
    } catch {
      // Not kept beyond this page: its memory holds it.
    }
  }

  /**
   * Nothing is kept: Sophia answered it (proposed, or refused for good), or the board shows it recorded. Given the key it
   * was sent under (`sent`), only that proposal goes: an answer that arrives late, after a newer proposal for the same
   * goal was kept, never ends the newer one, which would leave its outcome unknown and its key lost (Codex's review of
   * 0e5b5862, P3-2).
   */
  forget(at: ProposalAt, sent?: string): void {
    const key = proposalKey(at)
    const ours = (kept: Asked | null | undefined) => sent === undefined || kept?.key === sent
    if (ours(this.#memory.get(key))) this.#memory.delete(key)
    try {
      const storage = this.#storage()
      if (storage && ours(readKept(storage.getItem(key), at))) storage.removeItem(key)
    } catch {
      // Storage refused: nothing was kept there.
    }
  }

  /**
   * Only `viewer`'s stay, and nobody's where `viewer` is null: another viewer coming in forgets everyone else's, a
   * sign-out every viewer's. Nothing else in the tab goes.
   */
  onlyOf(viewer: string | null): void {
    const others = (key: string) => key.startsWith(PREFIX) && viewerOf(key) !== viewer
    for (const key of this.#memory.keys()) if (others(key)) this.#memory.delete(key)
    try {
      const storage = this.#storage()
      if (!storage) return
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      for (const key of keys) if (key !== null && others(key)) storage.removeItem(key)
    } catch {
      // Storage refused: nothing was kept there.
    }
  }

  /** Every viewer's, at a sign-out or a change of who is in: nothing of theirs stays on the device. */
  forgetAll(): void {
    this.onlyOf(null)
  }
}

/** Whose a kept proposal is, by its key: anything under the prefix that names nobody is nobody's, and goes. */
function viewerOf(key: string): string | undefined {
  try {
    const scope: unknown = JSON.parse(key.slice(PREFIX.length))
    return Array.isArray(scope) && typeof scope[0] === 'string' ? scope[0] : undefined
  } catch {
    return undefined
  }
}

/** The page's proposals. */
export const proposals = new Proposals()

/**
 * Whose a proposal is: the account signed in (accountOf), its token's subject, which a change of its email keeps; its
 * name only where the token has no subject it can read (a fixture identity's), as the drafts and padlock are kept.
 * Every part that keeps, finds or forgets one names its viewer so: the form, the board's reconciliation and who is in.
 */
export const proposalViewer = (identity: { name: string; token: string }): string => accountOf(identity)

/** Signing out, or another viewer coming in: no proposal of anyone's stays (App.tsx, beside talk-store's). */
export const forgetProposals = () => proposals.forgetAll()

/**
 * Whose proposals the device keeps, as the app knows who is in (App.tsx): the viewer signed in's; nobody's once it
 * knows nobody is (signed out, here or in another tab, a session that ended); not yet decided while it is still finding
 * out (loading, a sign-in link's question), so the start of every page load forgets nothing. Forgetting in the cleanup
 * of an effect on who is in did: it ran as each load went from loading to signed in (Codex's re-review of 6e9e2a9b).
 */
export function proposalsKeptFor(state: AuthState): string | null | undefined {
  if (state.status === 'signed_in') return proposalViewer(state.identity)
  return state.status === 'signed_out' ? null : undefined
}

/** Only the proposals of `who` stay (proposalsKeptFor); while who is in is not yet known, every one does. */
export function proposalsOnlyOf(who: string | null | undefined, kept = proposals): void {
  if (who !== undefined) kept.onlyOf(who)
}
