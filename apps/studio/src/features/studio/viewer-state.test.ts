import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { INITIAL_VIEWER_STATE, readViewerState, viewerKey, viewerReducer } from './viewer-state.ts'

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
    const s = { lens: 'explore' as const, drafts: { converse: 'hi' } }
    assert.deepEqual(readViewerState(JSON.stringify(s)), s)
    for (const raw of [null, '', '{', 'null', '42', '"x"', '[]'])
      assert.deepEqual(readViewerState(raw), INITIAL_VIEWER_STATE)
    assert.deepEqual(readViewerState('{"lens":"admin","drafts":{"converse":1,"evil":"x","build":"ok"}}'), {
      lens: 'converse',
      drafts: { build: 'ok' },
    })
  })
})
