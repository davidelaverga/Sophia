import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { EMPTY_SECTION, sectionAnchor } from './search.ts'

// 4306435438: a punctuation/emoji-only heading (empty 0072 anchor) is still a navigable, non-empty section target.
describe('a section hit\u2019s anchor', () => {
  it('an empty slug is named by a token no slug can be, with its repeats', () => {
    assert.equal(EMPTY_SECTION, '_')
    assert.equal(sectionAnchor(''), '_', 'the first punctuation/emoji heading')
    assert.equal(sectionAnchor('#1'), '_#1', 'its second repeat')
    assert.equal(sectionAnchor('#2'), '_#2')
  })
  it('an ordinary heading and its repeats are kept; a report row has none', () => {
    assert.equal(sectionAnchor('costs'), 'costs')
    assert.equal(sectionAnchor('costs#1'), 'costs#1')
    assert.equal(sectionAnchor('-'), '-', 'a slug of hyphens is a slug, not empty')
    assert.equal(sectionAnchor(null), null)
  })
})
