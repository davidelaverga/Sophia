import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ContributionActPreview, DiscussionEntry } from '@sophia/contracts'
import { actsOf, asksFirst, discussionItems, effectWords, failureOf, heldView, lastSaidAt } from './message-acts.ts'

const ME = '00000000-0000-4000-8000-0000000000a1'
const OTHER = '00000000-0000-4000-8000-0000000000a2'
const entry = (over: Partial<DiscussionEntry> = {}): DiscussionEntry => ({
  id: '00000000-0000-4000-8000-000000000001',
  actorId: ME,
  intent: 'discuss',
  origin: 'composer',
  text: 'Meet at nine.',
  sourceId: '00000000-0000-4000-8000-0000000000ae',
  sha256: '0'.repeat(64),
  createdAt: '2026-10-16T09:00:00.000Z',
  ...over,
})
const preview = (over: Partial<ContributionActPreview> = {}): ContributionActPreview => ({
  contributionId: entry().id,
  action: 'correct',
  revision: 1,
  erases: true,
  reach: [],
  previewToken: `v1.1.${'0'.repeat(64)}`,
  expiresAt: '2026-10-16T09:15:00.000Z',
  ...over,
})
const task = (n: number, kind: 'research' | 'design', restarts: boolean) => ({
  taskId: `00000000-0000-4000-8000-00000000000${n}`,
  kind,
  restarts,
})

describe('actsOf', () => {
  it('offers correct and withdraw on the reader’s own written message, withdraw only on one that shares a source', () => {
    assert.deepEqual(actsOf(entry({ kind: 'text' }), ME), ['correct', 'withdraw'])
    assert.deepEqual(actsOf(entry({ kind: 'reference' }), ME), ['withdraw'])
  })

  it('offers nothing on someone else’s message, or on one read without its kind', () => {
    assert.deepEqual(actsOf(entry({ kind: 'text', actorId: OTHER }), ME), [])
    assert.deepEqual(actsOf(entry(), ME), [])
  })
})

describe('discussionItems', () => {
  it('keeps the entries’ order and puts withdrawn messages in their place, never beside their old entry', () => {
    const a = entry({ id: '00000000-0000-4000-8000-000000000001', createdAt: '2026-10-16T09:00:00.000Z' })
    const b = entry({ id: '00000000-0000-4000-8000-000000000002', createdAt: '2026-10-16T09:01:00.000Z' })
    const c = entry({ id: '00000000-0000-4000-8000-000000000003', createdAt: '2026-10-16T09:01:00.000Z' })
    const gone = {
      id: b.id,
      actorId: ME,
      authorName: null,
      createdAt: b.createdAt,
      withdrawnAt: '2026-10-16T10:00:00.000Z',
    }
    assert.deepEqual(
      discussionItems([a, b, c], [gone]).map((i) => [i.type, i.id]),
      [
        ['entry', a.id],
        ['withdrawn', b.id],
        ['entry', c.id],
      ],
    )
  })
})

describe('effectWords', () => {
  it('says a correction erases the earlier words, and that sent words can’t be called back', () => {
    assert.deepEqual(effectWords(preview()), [
      'Your earlier words are erased. The message keeps its place and shows as edited.',
      'Words already sent to an AI provider can’t be called back.',
    ])
  })

  it('names the work that read the words: research started again, research stopped, designs stopped', () => {
    const words = effectWords(
      preview({
        action: 'withdraw',
        reach: [
          task(1, 'research', true),
          task(2, 'research', true),
          task(3, 'research', false),
          task(4, 'design', false),
        ],
      }),
    )
    assert.deepEqual(words, [
      'Your words are erased. The chat shows that you withdrew a message.',
      '2 research tasks that read them will stop and start again without them.',
      'One research task that read them will stop.',
      'One page design that read them will stop.',
      'Words already sent to an AI provider can’t be called back.',
    ])
  })

  it('says a shared report or file stays, and promises nothing about providers when nothing is erased', () => {
    assert.deepEqual(effectWords(preview({ action: 'withdraw', erases: false })), [
      'The message leaves the chat. The report or file it shared stays as it is.',
    ])
  })
})

describe('asksFirst', () => {
  it('always asks before a withdrawal; before a correction only when work read the words', () => {
    assert.equal(asksFirst(preview({ action: 'withdraw' })), true)
    assert.equal(asksFirst(preview()), false)
    assert.equal(asksFirst(preview({ reach: [task(1, 'research', true)] })), true)
  })
})

describe('failureOf', () => {
  it('retries a lost reply with the same key; a stale message is read again; never a raw code', () => {
    assert.deepEqual(failureOf('outcome_unknown').sameKey, true)
    assert.deepEqual([failureOf('stale_revision').reread, failureOf('stale_revision').sameKey], [true, false])
    assert.equal(failureOf('request_erased').reread, true)
    for (const code of ['outcome_unknown', 'stale_revision', 'forbidden', 'invalid_request', 'unavailable'])
      assert.ok(!failureOf(code).words.includes('_'))
  })
})

const at = (n: number) => `2026-10-16T09:0${n}:00.000Z`
const e = (n: number, over: Partial<DiscussionEntry> = {}) =>
  entry({ id: `00000000-0000-4000-8000-00000000000${n}`, createdAt: at(n), text: `Message ${n}`, ...over })
const held = (...entries: DiscussionEntry[]) => ({
  entries: new Map(entries.map((x) => [x.id, x])),
  withdrawn: new Map(),
})

describe('heldView', () => {
  it('lets the window decide for its span: a held message it no longer lists is gone; older held ones stay', () => {
    const view = heldView(held(e(1), e(2), e(3), e(4)), { entries: [e(2), e(4)], withdrawn: [] }, new Map())
    assert.deepEqual(
      view.entries.map((x) => x.text),
      ['Message 1', 'Message 2', 'Message 4'],
    )
  })

  it('shows the reader’s own act until a read brings it, never over a newer read, and a withdrawal as a place only', () => {
    const fixed = e(2, { text: 'Fixed', revision: 2 })
    const gone = { id: e(1).id, actorId: ME, authorName: null, createdAt: at(1), withdrawnAt: at(5) }
    const acted = new Map([
      [fixed.id, { type: 'corrected' as const, entry: fixed }],
      [gone.id, { type: 'withdrawn' as const, withdrawn: gone }],
    ])
    const view = heldView(null, { entries: [e(1, { revision: 1 }), e(2, { revision: 1 })], withdrawn: [] }, acted)
    assert.deepEqual(
      view.entries.map((x) => x.text),
      ['Fixed'],
    )
    assert.deepEqual(
      view.withdrawn.map((w) => w.id),
      [gone.id],
    )
    const newer = heldView(null, { entries: [e(2, { text: 'Newer', revision: 3 })], withdrawn: [] }, acted)
    assert.deepEqual(
      newer.entries.map((x) => x.text),
      ['Newer'],
    )
  })
})

describe('lastSaidAt', () => {
  it('counts a withdrawn message’s place: «Today» goes after a tombstone, even when no message is left', () => {
    const tomb = {
      id: entry().id,
      actorId: ME,
      authorName: null,
      createdAt: '2026-10-15T18:00:00.000Z',
      withdrawnAt: '2026-10-16T08:00:00.000Z',
    }
    assert.equal(lastSaidAt([], [tomb]), '2026-10-15T18:00:00.000Z')
    assert.equal(lastSaidAt([entry({ createdAt: '2026-10-15T09:00:00.000Z' })], [tomb]), '2026-10-15T18:00:00.000Z')
    assert.equal(lastSaidAt([], []), undefined)
  })
})
