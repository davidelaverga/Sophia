import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { Probes } from './probes.ts'
import {
  START,
  changeIfCurrent,
  changeKept,
  currentGeneration,
  fenceLifts,
  forgetKept,
  goneFrom,
  keepsFor,
  keptAt,
  liftFence,
  mentionsAt,
  replySlot,
  retireWithdrawn,
  withDraftMentions,
  withReplyArtifact,
  withReplyDraft,
  withDenied,
  withErasure,
  withFence,
  withFound,
  withStanding,
  withHome,
  withListed,
  withoutConversation,
  withoutMessage,
  withWithdrawal,
  type Kept,
} from './talk-store.ts'

const PLACE = 'project luis@sophia.test'
const draft = (text: string) => (was: NonNullable<ReturnType<typeof keptAt>>) => ({ ...was, drafts: { c1: text } })

describe('changeIfCurrent', () => {
  it('keeps a change made since the last forgetting', () => {
    forgetKept()
    changeIfCurrent(PLACE, currentGeneration(), draft('kept'))
    assert.equal(keptAt(PLACE)?.drafts.c1, 'kept')
  })

  it('drops a change from before a forgetting: a late write never brings back what the account left', () => {
    const born = currentGeneration()
    changeIfCurrent(PLACE, born, draft('before'))
    forgetKept()
    changeIfCurrent(PLACE, born, draft('late'))
    assert.equal(keptAt(PLACE), undefined)
  })
})

describe('withoutConversation', () => {
  it('lets go of an erased conversation’s draft, intent, message held, refusal and wait, and keeps the others’', () => {
    forgetKept()
    changeIfCurrent(PLACE, currentGeneration(), (was) => ({
      ...was,
      drafts: { c1: 'gone with it', c2: 'stays' },
      asks: { c1: false, c2: true },
      holds: { c1: { key: 'k1', ask: { text: 'held', askSophia: false }, sending: false }, c2: null },
      refusals: { c1: 'refused', c2: null },
      asked: { c1: { replyId: 'r1', messageId: 'm1', here: 1 }, c2: null },
    }))
    const kept = keptAt(PLACE)
    assert.ok(kept)
    const after = withoutConversation(kept, 'c1')
    assert.deepEqual(after.drafts, { c2: 'stays' })
    assert.deepEqual(after.asks, { c2: true })
    assert.deepEqual(after.holds, { c2: null })
    assert.deepEqual(after.refusals, { c2: null })
    assert.deepEqual(after.asked, { c2: null })
    assert.deepEqual(after.start, kept.start)
  })

  it('settles the erased conversation’s erasure alone: another conversation’s, and Still open’s decision, stay', () => {
    const kept = keptWith({
      erasures: { c1: { key: 'e1', ask: 'c1', sending: true }, c2: { key: 'e2', ask: 'c2', sending: false } },
      decision: DECISION,
    })
    const after = withoutConversation(kept, 'c1')
    assert.deepEqual(after.erasures, { c2: { key: 'e2', ask: 'c2', sending: false } })
    assert.deepEqual(after.erased, { c1: true })
    assert.deepEqual(after.decision, DECISION)
  })
})

describe('withErasure', () => {
  it('holds an erasure on its way or with no reply, and lets it go once answered, in doubt from then', () => {
    const kept = keptWith({})
    const sending = withErasure(kept, 'c1', { key: 'e1', ask: 'c1', sending: true }, 1)
    assert.deepEqual(sending.erasures, { c1: { key: 'e1', ask: 'c1', sending: true } })
    const unknown = withErasure(sending, 'c1', { key: 'e1', ask: 'c1', sending: false }, 2)
    assert.deepEqual(unknown.erasures, { c1: { key: 'e1', ask: 'c1', sending: false } })
    assert.deepEqual(unknown.doubted, {})
    const answered = withErasure(unknown, 'c1', null, 3)
    assert.deepEqual(answered.erasures, {})
    assert.deepEqual(answered.doubted, { c1: 3 })
  })

  it('never brings back a settled erasure: its old request failing, or answering late, changes nothing', () => {
    const settled = withoutConversation(keptWith({ erasures: { c1: { key: 'e1', ask: 'c1', sending: true } } }), 'c1')
    assert.equal(withErasure(settled, 'c1', { key: 'e1', ask: 'c1', sending: false }, 1), settled)
    assert.equal(withErasure(settled, 'c1', null, 2), settled)
    // Another conversation's erasure is its own.
    const other = withErasure(settled, 'c2', { key: 'e2', ask: 'c2', sending: true }, 3)
    assert.deepEqual(other.erasures, { c2: { key: 'e2', ask: 'c2', sending: true } })
  })
})

describe('withStanding: a conversation in doubt ends it only on a read set out since (PR #199 r4238311491)', () => {
  const inDoubt = withErasure(keptWith({}), 'c1', null, 5)

  it('a read set out after the doubt arose, finding it: it stands', () => {
    assert.deepEqual(withStanding(inDoubt, ['c1'], 6).doubted, {})
  })

  it('a read set out before, or when, it arose, or one that doesn’t find it: still in doubt, as it was', () => {
    assert.equal(withStanding(inDoubt, ['c1'], 4), inDoubt)
    assert.equal(withStanding(inDoubt, ['c1'], 5), inDoubt)
    assert.equal(withStanding(inDoubt, ['c2'], 6), inDoubt)
  })

  it('an erasure of it held again: not ended while it goes', () => {
    const again = withErasure(inDoubt, 'c1', { key: 'e2', ask: 'c1', sending: true }, 6)
    assert.equal(withStanding(again, ['c1'], 7), again)
  })

  it('erased: its doubt goes with it', () => {
    assert.deepEqual(withoutConversation(inDoubt, 'c1').doubted, {})
  })
})

describe('the fence: a read refused holds until a list read set out after the latest answers (PR #199 r4238709217, CX-0074)', () => {
  const fenced = withFence(keptWith({ drafts: { c1: 'kept words' } }), 5)

  it('fenced at the latest refusal: an earlier one moves it nothing, a later one on; nothing else kept changes', () => {
    assert.deepEqual(fenced.fence, { at: 5 })
    assert.equal(withFence(fenced, 3), fenced)
    assert.equal(withFence(fenced, 5), fenced)
    assert.deepEqual(withFence(fenced, 7).fence, { at: 7 })
    assert.equal(fenced.drafts.c1, 'kept words')
    assert.deepEqual(fenced.erased, {})
  })

  it('a list read set out before it, or when, lifts nothing: a failing or refused one never answers anew', () => {
    assert.equal(fenceLifts(fenced, 4), false)
    assert.equal(fenceLifts(fenced, 5), false)
    assert.equal(liftFence(fenced, 5), fenced)
  })

  it('one set out since lifts it, and settles nothing itself (the view settles one the read doesn’t list)', () => {
    assert.equal(fenceLifts(fenced, 6), true)
    const lifted = liftFence(fenced, 6)
    assert.equal(lifted.fence, null)
    assert.equal(lifted.drafts.c1, 'kept words')
    assert.deepEqual(lifted.erased, {})
    assert.equal(fenceLifts(lifted, 9), false)
  })

  it('kept with everything else, and forgotten with it', () => {
    forgetKept()
    changeKept(PLACE, (k) => withFence(k, 3))
    assert.deepEqual(keptAt(PLACE)?.fence, { at: 3 })
    forgetKept()
    assert.equal(keptAt(PLACE), undefined)
  })
})

describe('denied: a read within the project refused (403) settles nothing, and fences (CX-0073, CX-0074)', () => {
  const denied = withDenied(keptWith({ drafts: { c1: 'kept words' } }), 'c1', 5)

  it('noted at the refusal, fenced then, its draft kept and kept for (so read again), nothing erased', () => {
    assert.deepEqual(denied.denied, { c1: 5 })
    assert.deepEqual(denied.fence, { at: 5 })
    assert.equal(denied.drafts.c1, 'kept words')
    assert.deepEqual(denied.erased, {})
    assert.equal(keepsFor(withDenied(keptWith({}), 'c2', 5), 'c2'), true)
  })

  it('refused again later: noted then, and fenced then; an earlier refusal moves neither', () => {
    const later = withDenied(denied, 'c1', 7)
    assert.deepEqual([later.denied, later.fence], [{ c1: 7 }, { at: 7 }])
    assert.equal(withDenied(later, 'c1', 6), later)
  })

  it('an answer from a read set out before, or when, it was refused changes nothing; one set out since ends it', () => {
    assert.equal(withFound(denied, 'c1', 4), denied)
    assert.equal(withFound(denied, 'c1', 5), denied)
    const found = withFound(denied, 'c1', 6)
    assert.deepEqual(found.denied, {})
    assert.equal(found.drafts.c1, 'kept words')
    // A conversation's answer is its own, and lifts no fence: only a list read since does.
    assert.equal(withFound(denied, 'c2', 9), denied)
    assert.deepEqual(found.fence, { at: 5 })
  })

  it('erased: its refusal goes with it', () => {
    assert.deepEqual(withoutConversation(denied, 'c1').denied, {})
  })

  it('erased here already: refused, only fenced; and a list read listing it again never notes it seen (CX-0071)', () => {
    const erased = withoutConversation(keptWith({}), 'c1')
    const refused = withDenied(erased, 'c1', 5)
    assert.deepEqual([refused.denied, refused.fence], [{}, { at: 5 }])
    assert.equal(withListed(erased, ['c1'], false), erased)
    assert.deepEqual(withListed(erased, ['c1', 'c2'], true).listed, { c2: true })
  })
})

const held = (key: string) => ({ key, ask: 'words from the message', sending: false })

describe('a gone message’s part (PR #199 r4235397318, r4235397321)', () => {
  const parts = (): Partial<Kept> => ({
    proposals: { m1: held('p1'), m2: held('p2') },
    proposalRefusals: { m1: 'refused', m2: null },
    proposed: { m1: { id: 'd1', statement: 'words from the message' }, m2: null },
    withdrawals: { m1: held('w1'), m2: held('w2') },
    homes: { m1: 'c1', m2: 'c2' },
    decision: DECISION,
  })

  it('an erased conversation takes its messages’ proposals and withdrawals; another’s, and the decision, stay', () => {
    const after = withoutConversation(keptWith(parts()), 'c1')
    assert.deepEqual(Object.keys(after.proposals), ['m2'])
    assert.deepEqual(Object.keys(after.proposalRefusals), ['m2'])
    assert.deepEqual(Object.keys(after.proposed), ['m2'])
    assert.deepEqual(Object.keys(after.withdrawals), ['m2'])
    assert.deepEqual(after.homes, { m2: 'c2' })
    assert.deepEqual(after.gone, { m1: true })
    assert.deepEqual(after.decision, DECISION)
  })

  it('a late answer writing a gone message’s proposal back (ProposeHere writes its own) is left out', () => {
    keptWith(parts())
    changeKept(PLACE, (k) => withoutConversation(k, 'c1'))
    changeKept(PLACE, (k) => ({ ...k, proposals: { ...k.proposals, m1: held('p1') } }))
    changeKept(PLACE, (k) => ({ ...k, proposed: { ...k.proposed, m1: { id: 'd1', statement: 'late' } } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.equal(now.proposals.m1, undefined)
    assert.equal(now.proposed.m1, undefined)
    assert.deepEqual(now.proposals.m2, held('p2'))
  })

  it('a proposal whose home is not yet known goes with the erasure that names its message as read (r4237298613)', () => {
    // Pressed just before the erasure settled: its proposal kept, its home not yet written.
    keptWith({ proposals: { m3: held('p3'), m2: held('p2') }, homes: { m2: 'c2' }, decision: DECISION })
    changeKept(PLACE, (k) => withoutConversation(k, 'c1', ['m3']))
    // Its answer comes late, and writes it back: left out.
    changeKept(PLACE, (k) => ({ ...k, proposals: { ...k.proposals, m3: held('p3') } }))
    changeKept(PLACE, (k) => ({ ...k, proposed: { ...k.proposed, m3: { id: 'd3', statement: 'late' } } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.equal(now.proposals.m3, undefined)
    assert.equal(now.proposed.m3, undefined)
    assert.equal(now.gone.m3, true)
    // Another conversation's proposal, and the decision, stay.
    assert.deepEqual(now.proposals.m2, held('p2'))
    assert.deepEqual(now.decision, DECISION)
  })

  it('a message withdrawn here takes its own part only', () => {
    const after = withoutMessage(keptWith(parts()), 'm1')
    assert.deepEqual(Object.keys(after.proposals), ['m2'])
    assert.deepEqual(Object.keys(after.withdrawals), ['m2'])
    assert.deepEqual(after.gone, { m1: true })
  })

  it('a withdrawal is held under its message, its conversation known, and never comes back once gone', () => {
    const k = withWithdrawal(keptWith({}), 'm1', 'c1', held('w1'))
    assert.deepEqual(k.withdrawals, { m1: held('w1') })
    assert.deepEqual(k.homes, { m1: 'c1' })
    assert.deepEqual(withWithdrawal(k, 'm1', 'c1', null).withdrawals, {})
    const gone = withoutMessage(k, 'm1')
    assert.equal(withWithdrawal(gone, 'm1', 'c1', held('w1')), gone)
    assert.equal(withHome(withHome(k, 'm9', 'c3'), 'm9', 'c3').homes.m9, 'c3')
  })
})

describe('an erased conversation’s own part (Codex on a3422f4)', () => {
  const sendHeld = { key: 's1', ask: { text: 'SYNTHETIC-ERASED-SEND-WORDS', askSophia: false }, sending: false }

  it('a late answer to a send writing its held message, refusal or wait back is left out; another’s and the decision stay', () => {
    keptWith({ drafts: { c1: 'gone', c2: 'stays' }, holds: { c2: null }, decision: DECISION })
    changeKept(PLACE, (k) => withoutConversation(k, 'c1'))
    changeKept(PLACE, (k) => ({ ...k, holds: { ...k.holds, c1: sendHeld } }))
    changeKept(PLACE, (k) => ({ ...k, refusals: { ...k.refusals, c1: 'refused late' } }))
    changeKept(PLACE, (k) => ({ ...k, asked: { ...k.asked, c1: { replyId: 'r1', messageId: 'm1', here: 1 } } }))
    changeKept(PLACE, (k) => ({ ...k, drafts: { ...k.drafts, c1: 'typed late' } }))
    const now = keptAt(PLACE)
    assert.ok(now)
    assert.deepEqual(
      [now.holds.c1, now.refusals.c1, now.asked.c1, now.drafts.c1],
      [undefined, undefined, undefined, undefined],
    )
    assert.equal(now.drafts.c2, 'stays')
    assert.deepEqual(now.decision, DECISION)
  })
})

describe('keepsFor: by what is kept, not by an entry left empty (PR #199 r4235731017)', () => {
  it('an empty draft and cleared entries keep nothing; words, a held message, an erasure’s key or a proposal do', () => {
    const empty = keptWith({
      drafts: { c1: '  ' },
      asks: { c1: false },
      holds: { c1: null },
      refusals: { c1: null },
      asked: { c1: null },
      homes: { m1: 'c1' },
      proposals: { m1: null },
      proposed: { m1: null },
    })
    assert.equal(keepsFor(empty, 'c1'), false)
    assert.equal(keepsFor({ ...empty, drafts: { c1: 'words' } }, 'c1'), true)
    const message = { key: 's1', ask: { text: 'held words', askSophia: false }, sending: false }
    assert.equal(keepsFor({ ...empty, holds: { c1: message } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, erasures: { c1: { key: 'e1', ask: 'c1', sending: false } } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, proposals: { m1: held('p1') } }, 'c1'), true)
    assert.equal(keepsFor({ ...empty, drafts: { c2: 'words' } }, 'c1'), false)
  })
})

describe('goneFrom and withListed: only a whole list says one is gone', () => {
  it('seen in a list of the newest only, left out of one: kept; left out of a whole list later: gone', () => {
    // Opened on a project already past the newest the list holds: every list read so far is capped.
    let k = withListed(keptWith({ drafts: { c1: 'a draft' } }), ['c1', 'c2', 'c3'], false)
    assert.deepEqual(Object.keys(k.listed).toSorted(), ['c1', 'c2', 'c3'])
    // Erased elsewhere; a capped list leaves it out: nothing proved, it stays seen.
    k = withListed(k, ['c2', 'c3', 'c4'], false)
    assert.deepEqual(Object.keys(k.listed).toSorted(), ['c1', 'c2', 'c3', 'c4'])
    // A whole list, read now, without it: gone, though no earlier whole list ever held it.
    assert.deepEqual(goneFrom(k, ['c2', 'c3', 'c4']), ['c1'])
    const settled = withListed(withoutConversation(k, 'c1'), ['c2', 'c3', 'c4'], true)
    assert.deepEqual(Object.keys(settled.listed).toSorted(), ['c2', 'c3', 'c4'])
    assert.equal(settled.drafts.c1, undefined)
    assert.deepEqual(goneFrom(settled, ['c2', 'c3', 'c4']), [])
  })

  it('a draft with words counts though never seen listed (read back after a reload); an empty one doesn’t', () => {
    const k = keptWith({ drafts: { c1: 'kept in the tab', c2: '', c3: 'listed' } })
    assert.deepEqual(goneFrom(k, ['c3']), ['c1'])
    const settled = withoutConversation(k, 'c1')
    assert.equal(settled.drafts.c1, undefined)
    assert.deepEqual(goneFrom(settled, ['c3']), [])
  })

  it('an erasure held here counts though never seen listed; a start seen listed is never gone while listed', () => {
    const k = withListed(keptWith({ erasures: { c9: { key: 'e9', ask: 'c9', sending: false } } }), ['c1'], true)
    assert.deepEqual(goneFrom(k, ['c1']), ['c9'])
    const started = withListed(k, ['c5', 'c1'], true)
    assert.deepEqual(goneFrom(started, ['c5', 'c1']), ['c9'])
  })
})

const DECISION = {
  key: 'd1',
  ask: { args: { decisionId: 'p1', revision: 3, decision: 'accept' as const }, statement: 'Map first' },
  sending: false,
}

/** What is kept for PLACE, these fields changed, everything else as it starts. */
function keptWith(fields: Partial<Kept>): Kept {
  forgetKept()
  changeIfCurrent(PLACE, currentGeneration(), (was) => ({ ...was, ...fields }))
  const kept = keptAt(PLACE)
  assert.ok(kept)
  return kept
}

/** This tab's session storage, as the page has it: what a reload keeps. */
function inTab() {
  const items = new Map<string, string>()
  Reflect.set(globalThis, 'sessionStorage', {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size
    },
  })
  return items
}
const outOfTab = () => Reflect.deleteProperty(globalThis, 'sessionStorage')

describe('messages held with no reply, kept in the tab (reliability-held-on-reload.md)', () => {
  const TAB_PLACE = 'project-tab luis'
  const TAB_KEY = 'sophia.held.v1:["luis","talk","project-tab"]'
  const ASK = { text: 'Did this one land?', askSophia: false }

  it('keeps each message held in the tab, its key and words, and lets it go once answered', () => {
    const items = inTab()
    try {
      forgetKept()
      changeKept(TAB_PLACE, (was) => ({ ...was, holds: { c1: { key: 'k1', ask: ASK, sending: true } } }))
      assert.deepEqual(JSON.parse(items.get(TAB_KEY) ?? 'null'), { c1: { key: 'k1', ask: ASK } })
      changeKept(TAB_PLACE, (was) => ({ ...was, holds: { c1: null } }))
      assert.equal(items.has(TAB_KEY), false)
    } finally {
      outOfTab()
    }
  })

  it('reads it back after a reload as sent with no reply: its key, its words', () => {
    const items = inTab()
    try {
      forgetKept()
      changeKept(TAB_PLACE, (was) => ({ ...was, holds: { c1: { key: 'k1', ask: ASK, sending: true } } }))
      // A reload: this page's memory is gone, the tab's storage stays (forgetting the memory leaves the tab's).
      forgetKept()
      assert.equal(items.has(TAB_KEY), true)
      assert.deepEqual(keptAt(TAB_PLACE)?.holds, { c1: { key: 'k1', ask: ASK, sending: false } })
    } finally {
      outOfTab()
    }
  })

  it('reads nothing back from an entry that isn’t a held message', () => {
    const items = inTab()
    try {
      forgetKept()
      items.set(TAB_KEY, JSON.stringify({ c1: { key: '', ask: ASK }, c2: { key: 'k2', ask: { text: 3 } } }))
      assert.equal(keptAt(TAB_PLACE), undefined)
    } finally {
      outOfTab()
    }
  })
})

describe('unsent words kept in the tab (drafts-survive-reload.md)', () => {
  const TAB_PLACE = 'project-tab luis'
  const TAB_KEY = 'sophia.drafts.v1:["luis","talk","project-tab"]'

  it('keeps each draft with words and its Ask Sophia in the tab, and lets it go once cleared', () => {
    const items = inTab()
    try {
      forgetKept()
      changeKept(TAB_PLACE, (was) => ({ ...was, drafts: { c1: 'Half a thought', c2: '' }, asks: { c1: false } }))
      assert.deepEqual(JSON.parse(items.get(TAB_KEY) ?? 'null'), { c1: { text: 'Half a thought', askSophia: false } })
      changeKept(TAB_PLACE, (was) => ({ ...was, drafts: { c1: '' } }))
      assert.equal(items.has(TAB_KEY), false)
    } finally {
      outOfTab()
    }
  })

  it('reads them back after a reload, each in its own conversation', () => {
    const items = inTab()
    try {
      forgetKept()
      changeKept(TAB_PLACE, (was) => ({ ...was, drafts: { c1: 'Half a thought' }, asks: { c1: false } }))
      forgetKept()
      assert.equal(items.has(TAB_KEY), true)
      const back = keptAt(TAB_PLACE)
      assert.deepEqual(back?.drafts, { c1: 'Half a thought' })
      assert.deepEqual(back?.asks, { c1: false })
      assert.deepEqual(back?.holds, {})
    } finally {
      outOfTab()
    }
  })

  it('keeps no draft longer than the most, and reads back nothing from an entry that isn’t drafts', () => {
    const items = inTab()
    try {
      forgetKept()
      changeKept(TAB_PLACE, (was) => ({ ...was, drafts: { c1: 'x'.repeat(10_001) } }))
      assert.equal(items.has(TAB_KEY), false)
      forgetKept()
      items.set(TAB_KEY, JSON.stringify({ c1: { text: 3 }, c2: 'loose' }))
      assert.equal(keptAt(TAB_PLACE), undefined)
    } finally {
      outOfTab()
    }
  })
})

describe('artifact context on an existing conversation', () => {
  const version = '61cf4775-421d-4f1f-9d06-f73c5e64d802'
  const target = '143f6af6-049d-488c-8c69-1c43952f2b06'
  const recipient = '4e7c52dc-adba-423f-ac63-012ee33648fa'

  function scopedAfterReload() {
    const slot = replySlot(target, version)
    assert.ok(slot)
    forgetKept()
    changeKept(PLACE, (k) => withReplyDraft(k, 'words', slot, 'Scoped words'))
    changeKept(PLACE, (k) => withReplyArtifact(k, 'attachment', version))
    changeKept(PLACE, (k) => withDraftMentions(k, 'mentions', slot, [recipient]))
    changeKept(PLACE, (k) => withReplyDraft(k, 'healthy', slot, 'Other conversation'))
    changeKept(PLACE, (k) => withReplyDraft(k, 'empty', slot, ' '))
    changeKept(PLACE, (k) => withDraftMentions(k, START, version, [recipient]))
    for (const otherPlace of ['other-project luis@sophia.test', 'project other@sophia.test']) {
      changeKept(otherPlace, (k) => withReplyDraft(k, 'words', slot, 'Other place'))
    }
    forgetKept()
    const back = keptAt(PLACE)
    assert.ok(back)
    assert.deepEqual(back.listed, {})
    assert.deepEqual(back.drafts, {})
    return { slot, back }
  }

  it('retires scope-only drafts and selections after reload when a complete list omits them', () => {
    inTab()
    try {
      const { slot, back } = scopedAfterReload()
      const missing = goneFrom(back, ['healthy'])
      assert.deepEqual(missing.toSorted(), ['attachment', 'mentions', 'words'])
      for (const id of missing) changeKept(PLACE, (k) => withoutConversation(k, id))
      forgetKept()
      const after = keptAt(PLACE)
      assert.ok(after)
      assert.equal(after.replyDrafts.words, undefined)
      assert.equal(after.replyDrafts.attachment, undefined)
      assert.equal(after.mentionDrafts.mentions, undefined)
      assert.equal(after.replyDrafts.healthy?.drafts[slot], 'Other conversation')
      assert.deepEqual(mentionsAt(after, START, version), [recipient])
      for (const otherPlace of ['other-project luis@sophia.test', 'project other@sophia.test']) {
        assert.equal(keptAt(otherPlace)?.replyDrafts.words?.drafts[slot], 'Other place')
      }
    } finally {
      outOfTab()
    }
  })

  it('probes scope-only drafts omitted from a partial list and clears them only after not found', async () => {
    inTab()
    const reads: string[] = []
    const notFound = new Error('not found')
    const probes = new Probes({
      read: (id) => {
        reads.push(id)
        return id === 'mentions' ? Promise.reject(notFound) : Promise.resolve(null)
      },
      keeps: (id) => {
        const current = keptAt(PLACE)
        return current !== undefined && keepsFor(current, id)
      },
      settle: (id) => changeKept(PLACE, (k) => withoutConversation(k, id)),
      deny: () => assert.fail('unexpected denial'),
      found: () => undefined,
      notFound: (error) => error === notFound,
      denied: () => false,
    })
    try {
      const { slot, back } = scopedAfterReload()
      changeKept(PLACE, (k) => withListed(k, ['healthy'], false))
      assert.deepEqual(keptAt(PLACE)?.replyDrafts, back.replyDrafts)
      assert.deepEqual(keptAt(PLACE)?.mentionDrafts, back.mentionDrafts)
      for (const id of goneFrom(back, ['healthy'])) probes.start(id)
      await Promise.resolve()
      assert.deepEqual(reads.toSorted(), ['attachment', 'mentions', 'words'])
      forgetKept()
      const after = keptAt(PLACE)
      assert.ok(after)
      assert.equal(after.replyDrafts.words?.drafts[slot], 'Scoped words')
      assert.equal(after.replyDrafts.attachment?.artifactVersionId, version)
      assert.equal(after.mentionDrafts.mentions, undefined)
      assert.equal(after.replyDrafts.healthy?.drafts[slot], 'Other conversation')
    } finally {
      probes.stopAll()
      outOfTab()
    }
  })

  it('purges a withdrawn target’s scoped words and mentions without touching an untargeted draft for that version', () => {
    const targeted = replySlot(target, version)
    const untargeted = replySlot(null, version)
    assert.ok(targeted && untargeted)
    forgetKept()
    changeKept(PLACE, (was) => withReplyArtifact(was, 'c1', version))
    changeKept(PLACE, (was) => withReplyDraft(was, 'c1', targeted, 'Context for a message'))
    changeKept(PLACE, (was) => withReplyDraft(was, 'c1', untargeted, 'Context for the project'))
    changeKept(PLACE, (was) => withDraftMentions(was, 'c1', targeted, [recipient]))
    changeKept(PLACE, (was) => withDraftMentions(was, 'c1', untargeted, [recipient]))
    changeKept(PLACE, (was) => withoutMessage(was, target))
    const back = keptAt(PLACE)
    assert.ok(back)
    assert.deepEqual(back.replyDrafts.c1?.drafts, { [untargeted]: 'Context for the project' })
    assert.deepEqual(mentionsAt(back, 'c1', targeted), [])
    assert.deepEqual(mentionsAt(back, 'c1', untargeted), [recipient])
  })

  it('retires a mention-only withdrawn target in an inactive artifact scope without losing an exact held send', () => {
    const targeted = replySlot(target, version)
    const untargeted = replySlot(null, version)
    assert.ok(targeted && untargeted)
    forgetKept()
    const send = {
      key: 'recorded-key',
      ask: {
        text: 'Sent once',
        askSophia: false,
        addressingVersion: 1 as const,
        replyToMessageId: target,
        artifactVersionId: version,
        mentions: [recipient],
      },
      sending: false,
    }
    changeKept(PLACE, (was) => withDraftMentions(was, 'c1', targeted, [recipient]))
    changeKept(PLACE, (was) => withDraftMentions(was, 'c1', untargeted, [recipient]))
    changeKept(PLACE, (was) => ({ ...was, holds: { c1: send } }))
    retireWithdrawn('luis@sophia.test', [target])
    const back = keptAt(PLACE)
    assert.ok(back)
    assert.deepEqual(mentionsAt(back, 'c1', targeted), [])
    assert.deepEqual(mentionsAt(back, 'c1', untargeted), [recipient])
    assert.deepEqual(back.holds.c1, send)
    assert.equal(back.gone[target], true)
  })

  it('ignores a stored held write with a supplied malformed version instead of restoring it as unscoped', () => {
    const items = inTab()
    try {
      forgetKept()
      const place = 'project-tab luis'
      const key = 'sophia.held.v1:["luis","talk","project-tab"]'
      items.set(
        key,
        JSON.stringify({
          c1: {
            key: 'request',
            ask: {
              text: 'words',
              askSophia: false,
              addressingVersion: 1,
              replyToMessageId: target,
              artifactVersionId: 'not-a-version',
            },
          },
        }),
      )
      assert.equal(keptAt(place), undefined)
    } finally {
      outOfTab()
    }
  })
})
