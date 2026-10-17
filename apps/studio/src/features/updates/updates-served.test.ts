import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { ApiError } from '../../api/client.ts'
import { getSince, sinceParser } from '../../api/vision.ts'
import { recapSections } from '../voice/recap-view.ts'
import { digestLead, narrowRecords, peopleOf } from './updates-view.ts'

// Updates as A34 serves it (docs/plans/project-updates.md, the narrow activation gap): a window whose people and moments
// may be null (nobody readable to name, no moment kept), and `more` when events lie after it. Read by the contract's
// parser outside the vision flag; said without inventing a person or a date. Every id and word is synthetic.

const realFetch = globalThis.fetch
const PROJECT = '00000000-0000-4000-8000-0000000000aa'
const MARCO = '00000000-0000-4000-8000-00000000a001'
const ME = '00000000-0000-4000-8000-00000000d001'
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A valid A34 window: one decision with nobody named and no moment, one decided by Marco, a report nobody asked. */
const window34 = (over: Record<string, unknown> = {}) => ({
  fromSequence: '7',
  toSequence: '12',
  more: true,
  decided: [
    { decisionId: id(1), statement: 'Ship on Friday', proposedBy: null, decidedBy: null, at: null, undoable: false },
    {
      decisionId: id(2),
      statement: 'Keep the retry',
      proposedBy: null,
      decidedBy: MARCO,
      at: '2026-10-16T09:00:00.000Z',
      undoable: false,
    },
  ],
  made: [{ artifactId: id(3), artifactVersionId: id(4), title: 'Launch notes', versionNumber: 2, askedBy: null }],
  noted: [],
  open: [],
  work: [],
  names: { [MARCO]: 'Marco' },
  ...over,
})

const answering = (body: unknown) => {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
}

const refused = async (body: unknown) => {
  answering(body)
  await assert.rejects(
    getSince('token', PROJECT),
    (err) => err instanceof ApiError && err.code === 'contract_violation',
  )
}

describe('Updates served (A34)', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('reads a valid window with nobody named, no moment and more after it, as it is', async () => {
    answering(window34())
    const got = await getSince('token', PROJECT)
    assert.equal(got.more, true)
    assert.equal(got.decided[0]?.proposedBy, null)
    assert.equal(got.decided[0]?.at, null)
    assert.equal(got.made[0]?.askedBy, null)
  })

  it('still refuses a window that breaks the contract, nulls aside', async () => {
    // Everyone named, so only what breaks the contract is refused: no `more`, a field missing, a wrong kind, an id
    // that is no actor's.
    const decided = { ...window34().decided[1], proposedBy: MARCO }
    const made = {
      artifactId: id(3),
      artifactVersionId: id(4),
      title: 'Launch notes',
      versionNumber: 2,
      askedBy: MARCO,
    }
    const named = window34({ decided: [decided], made: [made] })
    answering(named)
    assert.equal((await getSince('token', PROJECT)).decided[0]?.proposedBy, MARCO)
    const { more: _more, ...withoutMore } = named
    await refused(withoutMore)
    const { askedBy: _askedBy, ...unasked } = made
    await refused({ ...named, made: [unasked] })
    await refused({ ...named, decided: [{ ...decided, decidedBy: 42 }] })
    await refused({ ...named, decided: [{ ...decided, decidedBy: 'marco' }] })
    // A field the contract does not list is dropped as the contract's reader drops it (removeAdditional), never kept.
    answering({ ...named, extra: true })
    assert.equal('extra' in (await getSince('token', PROJECT)), false)
  })

  it('names only who is named, and says no moment it does not have', () => {
    const shown = recapSections(
      window34(),
      (who) => (who === MARCO ? 'Marco' : 'a member'),
      false,
      (at) => `at ${at}`,
    )
    assert.deepEqual(
      shown.map((s) => [s.title, s.lines.map((l) => l.by)]),
      [
        ['Decided', ['', 'decided by Marco · at 2026-10-16T09:00:00.000Z']],
        ['Made', ['']],
      ],
    )
  })

  it('lists only the people named, and narrows to them alone', () => {
    const w = window34()
    assert.deepEqual(peopleOf(w, w.names, ME), [{ id: MARCO, name: 'Marco' }])
    const byMarco = narrowRecords(w, { kind: 'all', person: MARCO })
    assert.deepEqual(
      byMarco.decided.map((d) => d.decisionId),
      [id(2)],
    )
    assert.deepEqual(byMarco.made, [])
  })

  it('says a bounded window is only its first part, never everything or nothing new', () => {
    assert.equal(
      digestLead(window34({ fromSequence: null })),
      'You haven’t looked before. This is only the first part: mark it as seen to read on.',
    )
    assert.equal(
      digestLead(window34({ decided: [], made: [] })),
      'This is only the first part of what changed: mark it as seen to read on.',
    )
    assert.equal(digestLead(window34()), 'This is only the first part of what changed: mark it as seen to read on.')
    assert.equal(digestLead(window34({ more: false, decided: [], made: [] })), 'Nothing new since you last looked.')
  })
})

describe('the A34 window under either flag (the wire does not change with the build)', () => {
  /** The fixture pages' older shape: everyone named, every moment kept, no `more`. */
  const digest = () => {
    const { more: _more, ...rest } = window34({
      decided: [{ ...window34().decided[1], proposedBy: MARCO }],
      made: [{ ...window34().made[0], askedBy: MARCO }],
    })
    return rest
  }

  for (const vision of [false, true]) {
    it(`reads the served window, nulls and more included, with the vision flag ${vision ? 'on' : 'off'}`, () => {
      const got = sinceParser(vision)(window34())
      assert.equal(got.more, true)
      assert.equal(got.decided[0]?.decidedBy, null)
      assert.equal(got.made[0]?.askedBy, null)
    })
  }

  it('still reads the fixture pages’ older shape under the vision flag, and only there', () => {
    assert.equal(sinceParser(true)(digest()).more, undefined)
    assert.throws(() => sinceParser(false)(digest()), /ProjectUpdates/)
  })

  it('refuses under the vision flag what neither shape is', () => {
    assert.throws(() => sinceParser(true)({ ...window34(), toSequence: 12 }))
  })
})
