import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import type { MissionDecision } from '@sophia/contracts'
import {
  briefNow,
  briefSays,
  decidableHere,
  decideRefusal,
  openAs,
  pressesWait,
  proposedWhere,
  readSince,
  refusalWords,
  stateOf,
  statementFrom,
  type ContextRead,
} from './decide.ts'
import {
  changeIfCurrent,
  currentGeneration,
  forgetKept,
  keptAt,
  liftFence,
  withDenied,
  withFence,
  type Kept,
} from './talk-store.ts'

describe('a message proposed as a decision (C7)', () => {
  it('a member’s words, on one line, as written', () => {
    assert.equal(
      statementFrom('One page,\nwith the sources inline, then.', false),
      'One page, with the sources inline, then.',
    )
  })

  it('Sophia’s words without the marks they are drawn with', () => {
    assert.equal(
      statementFrom('Where it stands:\n- Marco: One page.\n- Lucía: Sources inline.', true),
      'Where it stands: Marco: One page. · Lucía: Sources inline.',
    )
  })

  it('a long message is cut after a sentence within 200 characters', () => {
    const long = 'The brief keeps to one page so a new admin reads it in a minute. '.repeat(4)
    const cut = statementFrom(long, false)
    assert.ok(cut.length <= 200, String(cut.length))
    assert.ok(cut.endsWith('minute.'), cut)
  })

  it('one long sentence is cut at a word, and says so', () => {
    const cut = statementFrom(`Keep ${'everything '.repeat(40)}short`, false)
    assert.ok(cut.length <= 201, String(cut.length))
    assert.ok(cut.endsWith('everything…'), cut)
  })
})

const d = (kind: string, stale: boolean) => ({ kind, stale }) as unknown as MissionDecision

describe('a refused decision', () => {
  it('a stale revision says someone decided first; a refused role says so; anything else says try again', () => {
    assert.equal(
      refusalWords(new ApiError(409, 'stale_revision', 'stale', 'never'), 'decide'),
      'Someone decided it first. This is the brief as it is now.',
    )
    assert.equal(
      refusalWords(new ApiError(409, 'idempotency_mismatch', 'x', 'never'), 'propose'),
      'That proposal couldn’t be sent as written. Try again.',
    )
    assert.equal(refusalWords(new ApiError(403, 'forbidden', 'x', 'never'), 'decide'), 'You can’t decide this here.')
    assert.equal(
      refusalWords(new ApiError(503, 'unavailable', 'down', 'safe_read'), 'propose'),
      'That couldn’t be done. Try again in a moment.',
    )
  })

  it('a constraint or a lesson is decided here; a new direction or a stale one is not', () => {
    assert.equal(decidableHere(d('constraint', false)), true)
    assert.equal(decidableHere(d('lesson', false)), true)
    assert.equal(decidableHere(d('mission', false)), false)
    assert.equal(decidableHere(d('constraint', true)), false)
  })
})

describe('a proposal already waiting (reconciled before a fresh one goes)', () => {
  const waiting = [
    { kind: 'constraint' as const, statement: 'Map first, list second' },
    { kind: 'constraint' as const, statement: 'Briefs stay on one page' },
    { kind: 'mission' as const, statement: 'Reports for every team' },
  ]

  it('is found by its words, whatever the spaces or the case', () => {
    assert.equal(!!openAs(waiting, '  briefs stay on ONE page '), true)
  })

  it('other words are a new proposal', () => {
    assert.equal(!!openAs(waiting, 'Briefs stay on two pages'), false)
    assert.equal(!!openAs([], 'Map first, list second'), false)
  })

  it('the same words waiting as another kind (a new direction) are not this constraint', () => {
    assert.equal(!!openAs(waiting, 'Reports for every team'), false)
  })
})

describe('a proposal not sent because the brief could not be read first', () => {
  it('says nothing was sent, and to try again', () => {
    const unread = new ApiError(503, 'brief_unread', 'The brief could not be read', 'never')
    assert.equal(refusalWords(unread, 'propose'), 'Couldn’t check the brief first, so nothing was sent. Try again.')
  })
})

describe('a decision on its way (Still open)', () => {
  const asked = { decisionId: 'a', revision: 1, decision: 'accept' as const }
  const waiting = [{ id: 'a' }, { id: 'b' }]

  it('the presses wait while it goes and while its outcome is unknown', () => {
    assert.equal(pressesWait({ status: 'sending', args: asked }, waiting), true)
    assert.equal(pressesWait({ status: 'unknown', args: asked }, waiting), true)
  })

  it('answered, they wait until the brief read again no longer lists it', () => {
    assert.equal(pressesWait({ status: 'done', args: asked }, waiting), true)
    assert.equal(pressesWait({ status: 'done', args: asked }, [{ id: 'b' }]), false)
  })

  it('idle or refused, they don’t wait', () => {
    assert.equal(pressesWait({ status: 'idle' }, waiting), false)
    assert.equal(pressesWait({ status: 'rejected', words: 'Someone decided it first.' }, waiting), false)
  })

  it('refused while it still waits: the brief changed, not decided by someone', () => {
    const stale = new ApiError(409, 'stale_revision', 'stale', 'never')
    assert.equal(
      decideRefusal(stale, { fresh: true, stillWaiting: true }),
      'It can’t be decided as it is: the brief changed since. This is the brief as it is now.',
    )
    assert.equal(
      decideRefusal(stale, { fresh: true, stillWaiting: false }),
      'Someone decided it first. This is the brief as it is now.',
    )
    const forbidden = new ApiError(403, 'forbidden', 'x', 'never')
    assert.equal(decideRefusal(forbidden, { fresh: true, stillWaiting: true }), 'You can’t decide this here.')
  })

  it('refused with the brief not read again: words true either way, none saying it shows the brief as it is', () => {
    const stale = new ApiError(409, 'stale_revision', 'stale', 'never')
    for (const stillWaiting of [true, false]) {
      assert.equal(
        decideRefusal(stale, { fresh: false, stillWaiting }),
        'It wasn’t decided here: the brief changed since.',
      )
    }
  })
})

describe('Still open’s decision, from what the view holds (held-decision.md)', () => {
  const ask = { args: { decisionId: 'a', revision: 1, decision: 'accept' as const }, statement: 'Map first' }

  it('held, it is on its way, or has no reply', () => {
    assert.deepEqual(stateOf({ key: 'k', ask, sending: true }, null, null), { status: 'sending', args: ask.args })
    assert.deepEqual(stateOf({ key: 'k', ask, sending: false }, null, null), { status: 'unknown', args: ask.args })
  })

  it('held wins over a refusal or an answer left from before', () => {
    assert.deepEqual(stateOf({ key: 'k', ask, sending: false }, 'Refused.', ask), { status: 'unknown', args: ask.args })
  })

  it('let go: refused in its words, else answered, else nothing', () => {
    assert.deepEqual(stateOf(null, 'Refused.', ask), { status: 'rejected', words: 'Refused.' })
    assert.deepEqual(stateOf(null, null, ask), { status: 'done', args: ask.args })
    assert.deepEqual(stateOf(null, null, null), { status: 'idle' })
  })
})

describe('where a message’s proposal stands, in the brief as last read (proposed-truth.md)', () => {
  const pending = [
    { id: 'p1', kind: 'constraint', statement: 'Briefs stay on one page' },
  ] as unknown as MissionDecision[]
  const read = { isError: false, data: { pending } }

  it('waiting while the brief lists it, by its id, or by its words when the receipt named none', () => {
    assert.equal(proposedWhere(read, { id: 'p1', statement: 'anything' }), 'waiting')
    assert.equal(proposedWhere(read, { id: null, statement: '  briefs stay ON one page ' }), 'waiting')
  })

  it('gone once the brief, read, no longer lists it', () => {
    assert.equal(proposedWhere(read, { id: 'p2', statement: 'Briefs stay on one page' }), 'gone')
    assert.equal(proposedWhere({ isError: false, data: { pending: [] } }, { id: null, statement: 'x' }), 'gone')
  })

  it('by its words only among the constraints waiting: a mission or lesson with them is not it', () => {
    const lesson = [{ id: 'l1', kind: 'lesson', statement: 'Briefs stay on one page' }] as unknown as MissionDecision[]
    assert.equal(
      proposedWhere({ isError: false, data: { pending: lesson } }, { id: null, statement: 'Briefs stay on one page' }),
      'gone',
    )
  })

  it('not read again when the last read failed, or there is none yet', () => {
    assert.equal(proposedWhere({ isError: true, data: { pending } }, { id: 'p1', statement: 'x' }), 'unread')
    assert.equal(proposedWhere({ isError: false, data: undefined }, { id: 'p1', statement: 'x' }), 'unread')
  })
})

/** A read of the brief set out at `readFrom`, in this view's order. */
const brief = (readFrom: number) => ({ readFrom, pending: [] }) as unknown as ContextRead

describe('the brief as it may show now, whatever refused (PR #199 r4239772110, r4239851727)', () => {
  const PLACE = 'p-brief brief@example.test'
  /** Nothing kept yet for this project and account: never refused here. */
  function nothingKept(): Kept {
    forgetKept()
    changeIfCurrent(PLACE, currentGeneration(), (was) => was)
    const kept = keptAt(PLACE)
    assert.ok(kept)
    return kept
  }

  it('never refused here: any read is current, and none is none', () => {
    const read = brief(1)
    assert.equal(readSince(read, null), true)
    assert.equal(briefNow(read, nothingKept()), read)
    assert.equal(briefNow(undefined, nothingKept()), undefined)
  })

  const origins: Record<string, (k: Kept) => Kept> = {
    'the list read, or the context’s own (withFence)': (k) => withFence(k, 5),
    'a thread’s read, or a probe’s (withDenied)': (k) => withDenied(k, 'c1', 5),
  }
  for (const [origin, refuse] of Object.entries(origins)) {
    it(`${origin}: none while fenced; once lifted, only a read set out after the refusal`, () => {
      const fenced = refuse(nothingKept())
      assert.equal(fenced.refusedAt, 5)
      assert.equal(briefNow(brief(4), fenced), undefined)
      assert.equal(briefNow(brief(6), fenced), undefined)
      const lifted = liftFence(fenced, 6)
      assert.equal(lifted.fence, null)
      assert.equal(lifted.refusedAt, 5)
      // Cached, or answering late, from before the refusal or from its moment: not current.
      assert.equal(briefNow(brief(4), lifted), undefined)
      assert.equal(briefNow(brief(5), lifted), undefined)
      const since = brief(7)
      assert.equal(briefNow(since, lifted), since)
    })
  }

  it('the latest refusal counts: a later one moves it on, an older one never back', () => {
    const again = withFence(liftFence(withFence(nothingKept(), 5), 6), 9)
    assert.equal(again.refusedAt, 9)
    const lifted = liftFence(again, 10)
    assert.equal(briefNow(brief(8), lifted), undefined)
    assert.equal(withFence(lifted, 3).refusedAt, 9)
    assert.equal(briefNow(brief(11), lifted)?.readFrom, 11)
  })

  it('a refused decision’s brief: says anything only from a read that came back and may show now', () => {
    const waiting = { readFrom: 7, pending: [{ id: 'p1' }] } as unknown as ContextRead
    const unknown = { fresh: false, stillWaiting: false }
    const lifted = liftFence(withFence(nothingKept(), 5), 6)
    // No read yet; one under way with nothing yet; one failed, even holding an older answer.
    assert.deepEqual(briefSays(undefined, lifted, 'p1'), unknown)
    assert.deepEqual(briefSays({ status: 'pending', data: undefined }, lifted, 'p1'), unknown)
    assert.deepEqual(briefSays({ status: 'error', data: waiting }, lifted, 'p1'), unknown)
    // From before the latest refusal, or while fenced: unknown too.
    assert.deepEqual(briefSays({ status: 'success', data: { ...waiting, readFrom: 4 } }, lifted, 'p1'), unknown)
    assert.deepEqual(briefSays({ status: 'success', data: waiting }, withFence(lifted, 8), 'p1'), unknown)
    // Read since: said, and whether it still waits there.
    assert.deepEqual(briefSays({ status: 'success', data: waiting }, lifted, 'p1'), { fresh: true, stillWaiting: true })
    assert.deepEqual(briefSays({ status: 'success', data: waiting }, lifted, 'p2'), {
      fresh: true,
      stillWaiting: false,
    })
  })
})
