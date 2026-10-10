import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { FIELD_HEIGHT, FIELD_SCALE, fieldClass, searchClass } from './field-class.ts'

describe('fieldClass', () => {
  it('is `field` at its own size, `lg` only for a hero field', () => {
    assert.equal(fieldClass({}), 'field')
    assert.equal(fieldClass({ size: 'md' }), 'field')
    assert.equal(fieldClass({ size: 'lg' }), 'field lg')
  })

  it('says quiet when asked, and keeps the field’s own classes after the kit’s', () => {
    assert.equal(fieldClass({ quiet: true }), 'field quiet')
    assert.equal(fieldClass({ quiet: true, className: ' resource-search ' }), 'field quiet resource-search')
    assert.equal(fieldClass({ className: '' }), 'field')
  })
})

describe('searchClass', () => {
  it('is `search`, marks a tip, then the search’s own classes', () => {
    assert.equal(searchClass(), 'search')
    assert.equal(searchClass(undefined, true), 'search has-tip')
    assert.equal(searchClass('conv-filter'), 'search conv-filter')
    assert.equal(searchClass(' task-search ', true), 'search has-tip task-search')
  })
})

describe('the field scale', () => {
  it('a field is 36 or 44 px', () => {
    assert.deepEqual([...FIELD_SCALE], [36, 44])
    assert.equal(FIELD_HEIGHT.md, 36)
    assert.equal(FIELD_HEIGHT.lg, 44)
  })
})
