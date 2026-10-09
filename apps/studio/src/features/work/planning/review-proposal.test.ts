import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../../api/client.ts'
import { EARLIER, outcomeOf, proposalKey, Proposals, type Asked, type ProposalAt } from './review-proposal.ts'

/** A tab's session storage: what a reload of the page keeps. */
function tab() {
  const items = new Map<string, string>()
  return {
    items,
    storage: () => ({
      getItem: (k: string) => items.get(k) ?? null,
      setItem: (k: string, v: string) => void items.set(k, v),
      removeItem: (k: string) => void items.delete(k),
      key: (i: number) => [...items.keys()][i] ?? null,
      get length() {
        return items.size
      },
    }),
  }
}

/** A browser that refuses storage: every call throws. */
const refusing = () => ({
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('QuotaExceededError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
  key: () => {
    throw new Error('SecurityError')
  },
  length: 0,
})

const at: ProposalAt = { viewer: 'davide@sophia.test', project: 'project-1', goal: 'goal-1' }
const asked: Asked = {
  key: '6f1c7d3e-0b5a-4c2e-9d8f-1a2b3c4d5e6f',
  request: { goalId: 'goal-1', goalRevision: 3, sourceIds: ['s-2'], allowanceUsd: 0.5, purpose: 'Check the budgets' },
}

describe('a proposal whose outcome is unknown is kept beyond its form (Codex on 1acb1efa, P2)', () => {
  it('a form mounted again finds it: the same key and the same request', () => {
    const page = new Proposals(tab().storage)
    assert.equal(page.pending(at), null)
    page.keep(at, asked)
    assert.deepEqual(page.pending(at), asked)
  })

  it('a reload finds it: a new page, the same tab', () => {
    const t = tab()
    new Proposals(t.storage).keep(at, asked)
    assert.deepEqual(new Proposals(t.storage).pending(at), asked)
  })

  it('is kept per viewer, project and goal: another’s is never this one', () => {
    const t = tab()
    const page = new Proposals(t.storage)
    page.keep(at, asked)
    for (const other of [
      { ...at, viewer: 'luis@sophia.test' },
      { ...at, project: 'project-2' },
      { ...at, goal: 'goal-2' },
    ]) {
      assert.equal(page.pending(other), null, JSON.stringify(other))
      assert.equal(new Proposals(t.storage).pending(other), null, `${JSON.stringify(other)}, after a reload`)
    }
    // Scopes whose parts would join alike stay apart: each part is kept whole.
    assert.notEqual(
      proposalKey({ viewer: 'a', project: 'b.c', goal: 'd' }),
      proposalKey({ viewer: 'a.b', project: 'c', goal: 'd' }),
    )
  })

  it('reads nothing that is not this goal’s proposal under its key', () => {
    const t = tab()
    const page = new Proposals(t.storage)
    const key = proposalKey(at)
    for (const bad of [
      'not json',
      JSON.stringify({ key: asked.key }),
      JSON.stringify({ key: '', request: asked.request }),
      JSON.stringify({ ...asked, request: { ...asked.request, goalId: 'goal-2' } }),
      JSON.stringify({ ...asked, request: { ...asked.request, sourceIds: 's-2' } }),
      JSON.stringify({ ...asked, request: { ...asked.request, purpose: 4 } }),
    ]) {
      t.items.set(key, bad)
      assert.equal(new Proposals(t.storage).pending(at), null, bad)
      assert.equal(page.pending(at), null, `${bad}, on this page`)
    }
  })

  it('where the browser refuses storage, the page’s memory keeps it until the page goes', () => {
    const page = new Proposals(refusing)
    page.keep(at, asked)
    assert.deepEqual(page.pending(at), asked, 'a form mounted again finds it')
    assert.equal(new Proposals(refusing).pending(at), null, 'a reload cannot')
    page.forget(at)
    assert.equal(page.pending(at), null)
  })

  it('a sign-out, or another viewer coming in, forgets every viewer’s, and nothing else in the tab', () => {
    const t = tab()
    const page = new Proposals(t.storage)
    page.keep(at, asked)
    page.keep({ ...at, viewer: 'luis@sophia.test', goal: 'goal-2' }, asked)
    t.items.set('sophia.plan.seen.v3:["project-1"]', '{}')
    page.forgetAll()
    assert.equal(page.pending(at), null)
    assert.deepEqual([...t.items.keys()], ['sophia.plan.seen.v3:["project-1"]'], 'only what is not a proposal stays')
    const refused = new Proposals(refusing)
    refused.keep(at, asked)
    refused.forgetAll()
    assert.equal(refused.pending(at), null, 'the page’s memory too, where storage is refused')
  })

  it('Sophia’s answer ends it, on this page and in the tab', () => {
    const t = tab()
    const page = new Proposals(t.storage)
    page.keep(at, asked)
    page.forget(at)
    assert.equal(page.pending(at), null)
    assert.equal(new Proposals(t.storage).pending(at), null)
    assert.equal(t.items.size, 0, 'nothing is left in the tab')
  })
})

const failed = (status: number, code: string, retry: ApiError['retry']) => new ApiError(status, code, 'said', retry)

describe('what a failed proposal says, and whether it is kept (Codex on #107 and on 2c018256)', () => {
  it('keeps it, with its key and request, wherever Sophia may have recorded it', () => {
    for (const [why, err, said] of [
      ['no reply', failed(0, 'network', 'same_admission_key'), 'No reply from Sophia.'],
      ['a session that ended', failed(401, 'unauthorized', 'reauthorize'), 'Sign in again.'],
      ['ask again under the key', failed(409, 'in_flight', 'same_admission_key'), 'Sophia’s reply was unclear.'],
      ['a server failure', failed(503, 'unavailable', 'same_admission_key'), 'Sophia’s reply was unclear.'],
      ['an unreadable success', new SyntaxError('Unexpected end of JSON input'), 'Sophia’s reply was unclear.'],
    ] as const) {
      const outcome = outcomeOf(err, asked)
      assert.equal(outcome.state, 'unanswered', why)
      assert.ok(outcome.state === 'unanswered' && outcome.key === asked.key && outcome.request === asked.request, why)
      assert.ok(outcome.state === 'unanswered' && outcome.said.startsWith(said), `${why}: ${JSON.stringify(outcome)}`)
    }
  })

  it('ends it on a definite refusal, and on a conflict under its key (Sophia already holds one)', () => {
    assert.deepEqual(outcomeOf(failed(403, 'source_ineligible', 'never'), asked), { state: 'refused', said: 'said' })
    assert.deepEqual(outcomeOf(failed(409, 'stale_revision', 'never'), asked), { state: 'refused', said: 'said' })
    const conflict = outcomeOf(failed(409, 'idempotency_conflict', 'never'), asked)
    assert.equal(conflict.state, 'refused')
    assert.match(conflict.state === 'refused' ? conflict.said : '', /already holds a proposal sent under this key/u)
  })

  it('says, when found again, that it may already be recorded', () => {
    assert.match(EARLIER, /may already be recorded/u)
  })
})
