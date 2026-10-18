import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  addressLensFor,
  INITIAL_VIEWER_STATE,
  LENSES,
  lensesShown,
  lensInAddress,
  lensKept,
  readLensWrite,
  readViewerState,
  shownLens,
  storedViewerState,
  viewerKey,
  viewerReducer,
  withLensInAddress,
} from './viewer-state.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'

describe('viewer state', () => {
  it('changes the lens and keeps every draft', () => {
    let s = viewerReducer(INITIAL_VIEWER_STATE, { type: 'draft', lens: 'converse', text: 'Make the hero calmer' })
    s = viewerReducer(s, { type: 'lens', lens: 'build' })
    s = viewerReducer(s, { type: 'draft', lens: 'build', text: 'note' })
    assert.deepEqual(s, { lens: 'build', drafts: { converse: 'Make the hero calmer', build: 'note' } })
    assert.deepEqual(viewerReducer(s, { type: 'draft', lens: 'build', text: '' }).drafts, {
      converse: 'Make the hero calmer',
    })
  })

  it('returns the same object when nothing changes, so React skips the render', () => {
    assert.equal(viewerReducer(INITIAL_VIEWER_STATE, { type: 'lens', lens: 'converse' }), INITIAL_VIEWER_STATE)
  })

  it('keys state per viewer and project', () => {
    assert.notEqual(viewerKey('luis@sophia.test', P), viewerKey('davide@sophia.test', P))
    assert.notEqual(viewerKey('luis@sophia.test', P), viewerKey('luis@sophia.test', P.replace('6f', '7f')))
  })

  it('round-trips through storage and survives anything malformed', () => {
    const s = { lens: 'explore' as const, drafts: { explore: 'hi' } }
    assert.deepEqual(readViewerState(JSON.stringify(s)), s)
    for (const raw of [null, '', '{', 'null', '42', '"x"', '[]'])
      assert.deepEqual(readViewerState(raw), INITIAL_VIEWER_STATE)
    assert.deepEqual(readViewerState('{"lens":"admin","drafts":{"converse":1,"evil":"x","build":"ok"}}'), {
      lens: 'converse',
      drafts: { build: 'ok' },
    })
  })
})

it('chat drafts survive resnapshots in memory but never storage serialization or legacy reload', () => {
  const state = viewerReducer(INITIAL_VIEWER_STATE, { type: 'draft', lens: 'converse', text: 'Private unsent chat' })
  assert.equal(state.drafts.converse, 'Private unsent chat')
  assert.equal(JSON.stringify(storedViewerState(state)).includes('Private unsent chat'), false)
  assert.equal(readViewerState(JSON.stringify(state)).drafts.converse, undefined)
})

/** An address: its path and search, as `window.location` gives them. */
const at = (search: string, pathname = '/p/one') => ({ pathname, search })

describe('the lens in the address', () => {
  it('reads a lens the address names, and nothing else', () => {
    assert.equal(lensInAddress('?lens=explore'), 'explore')
    assert.equal(lensInAddress('?demo=1&lens=build'), 'build')
    assert.equal(lensInAddress('?lens=kitchen'), null)
    assert.equal(lensInAddress(''), null)
  })
  it('writes the lens beside the rest, Converse too; null takes it out (Codex on #242)', () => {
    assert.equal(withLensInAddress('?demo=1', 'build'), '?demo=1&lens=build')
    assert.equal(withLensInAddress('?demo=1&lens=build', 'converse'), '?demo=1&lens=converse')
    assert.equal(withLensInAddress('?lens=explore', null), '')
    assert.equal(withLensInAddress('', 'explore'), '?lens=explore')
  })
  it('is this viewer’s to read when fresh, written for them, or another address; another subject reads none', () => {
    const mine = viewerKey('davide', P)
    const wrote = { key: mine, address: '/p/one?lens=explore' }
    assert.equal(addressLensFor(mine, at('?lens=explore'), null), 'explore') // a shared link, opened fresh
    assert.equal(addressLensFor(mine, at('?lens=explore'), wrote), 'explore') // written by this shell
    assert.equal(addressLensFor(viewerKey('ana', P), at('?lens=explore'), wrote), null) // another subject, same page
    // Another project's link followed in this tab: its lens is read, whatever the tab wrote before (Codex on #242).
    assert.equal(addressLensFor(viewerKey('davide', 'two'), at('?lens=build', '/p/two'), wrote), 'build')
    assert.equal(addressLensFor(mine, at('?demo=1'), null), null)
  })
  it('reads the remembered write defensively', () => {
    assert.deepEqual(readLensWrite('{"key":"k","address":"/p?lens=build"}'), { key: 'k', address: '/p?lens=build' })
    assert.equal(readLensWrite('k'), null)
    assert.equal(readLensWrite('{"key":1,"address":"/p"}'), null)
    assert.equal(readLensWrite(null), null)
  })
})

describe('the lens in the address, kept and owned (Codex P2s on #242)', () => {
  it('goes along when an address is normalized: the report kept, the lens with it', () => {
    assert.equal(lensKept('?lens=build&demo=1', ''), '?lens=build')
    assert.equal(lensKept('?lens=build', '?report=r1'), '?report=r1&lens=build')
    assert.equal(lensKept('?demo=1', '?report=r1'), '?report=r1')
  })
  it('stays the last subject’s at that address though a report opened over it since', () => {
    const mine = viewerKey('davide', P)
    const wrote = { key: mine, address: '/p/one?lens=explore' }
    const here = { pathname: '/p/one', search: '?lens=explore&report=r1&version=v2' }
    assert.equal(addressLensFor(viewerKey('ana', P), here, wrote), null)
    assert.equal(addressLensFor(mine, here, wrote), 'explore')
  })
})

describe('the lenses shown (docs/plans/prod-honesty.md)', () => {
  it('offers Converse alone outside the vision flag, and every lens under it', () => {
    assert.deepEqual(lensesShown(false), ['converse'])
    assert.deepEqual(lensesShown(true), LENSES)
  })
  it('opens a stored or linked lens that is not shown as Converse, and keeps a shown one', () => {
    assert.equal(shownLens('explore', false), 'converse')
    assert.equal(shownLens('build', false), 'converse')
    assert.equal(shownLens('converse', false), 'converse')
    assert.equal(shownLens('build', true), 'build')
  })
})
