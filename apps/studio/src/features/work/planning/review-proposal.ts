// A source review's proposal whose outcome is unknown (WBC-02; Codex's automatic review of 1acb1efa, P2), kept beyond
// the form that sent it. Review sources held the proposal's key and its request in the component's state, so leaving
// Tasks or reloading the page lost them, and the next press minted a new key: a proposal Sophia had recorded, its
// answer lost, could be proposed a second time. Here it is kept while the tab lives (session storage, and this page's
// memory where storage is refused), per viewer, project and goal, until Sophia answers it: proposed, or a definite
// refusal. Until then it is the proposal that form sends again, its key and its request unchanged. Only the key and
// the request are kept, and another viewer's, project's or goal's proposal never meets this one.
import type { SourceReviewProposalRequest } from '@sophia/contracts'

/** Whose proposal, where: the viewer (their identity's stable name), the project and the goal. */
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

/** Where a proposal is kept: its viewer, project and goal, each whole (JSON), so no two scopes share a key. */
export const proposalKey = (at: ProposalAt) =>
  `sophia.review.proposal.v1:${JSON.stringify([at.viewer, at.project, at.goal])}`

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

/** What keeping needs of a storage. */
type Kept = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const isKept = (value: unknown): value is Kept =>
  isRecord(value) &&
  typeof value.getItem === 'function' &&
  typeof value.setItem === 'function' &&
  typeof value.removeItem === 'function'

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
      const raw = this.#storage()?.getItem(key)
      const kept: unknown = raw ? JSON.parse(raw) : null
      if (isAsked(kept, at)) return kept
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

  /** Sophia answered it (proposed, or refused for good): nothing is kept. */
  forget(at: ProposalAt): void {
    const key = proposalKey(at)
    this.#memory.delete(key)
    try {
      this.#storage()?.removeItem(key)
    } catch {
      // Storage refused: nothing was kept there.
    }
  }
}

/** The page's proposals. */
export const proposals = new Proposals()
