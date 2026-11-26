import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cutWords, NEAR, nameCount } from './name-limit.ts'

describe('nameCount', () => {
  it('stays quiet until the name is within the last 20 characters', () => {
    assert.equal(nameCount('', 180), null)
    assert.equal(nameCount('x'.repeat(180 - NEAR - 1), 180), null)
    assert.equal(nameCount('x'.repeat(180 - NEAR), 180), '160 / 180')
    assert.equal(nameCount('x'.repeat(180), 180), '180 / 180')
  })

  it('counts as the API counts: an emoji is one character', () => {
    assert.equal(nameCount(`${'x'.repeat(159)}🙂`, 180), '160 / 180')
  })
})

describe('cutWords', () => {
  it('says what was kept', () => {
    assert.equal(cutWords(180), 'Only the first 180 characters fit.')
  })
})
