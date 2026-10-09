import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allowanceOk, kib, selectionOf } from './review-sources.ts'

const sources = [
  { sourceId: 'a', byteLength: 20_000 },
  { sourceId: 'b', byteLength: 12_768 },
  { sourceId: 'c', byteLength: 1 },
]

describe('a source review selection', () => {
  it('holds the chosen sources together, each within the limit or not', () => {
    assert.deepEqual(selectionOf(sources, [], 32_768), { bytes: 0, over: false })
    assert.deepEqual(selectionOf(sources, ['a', 'b'], 32_768), { bytes: 32_768, over: false }, 'at the limit')
    assert.deepEqual(selectionOf(sources, ['a', 'b', 'c'], 32_768), { bytes: 32_769, over: true }, 'one byte over')
    assert.deepEqual(selectionOf(sources, ['c', 'x'], 32_768), { bytes: 1, over: false }, 'an unknown id adds nothing')
  })

  it('says sizes as the limit is stated', () => {
    assert.equal(kib(32_768), '32 KiB')
    assert.equal(kib(32_769), '32.1 KiB', 'one byte over never reads as the limit')
    assert.equal(kib(33_894), '33.1 KiB')
    assert.equal(kib(36_000), '35.2 KiB')
  })

  it('takes an allowance within the cap in millionths of a dollar, a sub-cent cap included', () => {
    assert.equal(allowanceOk(0.5, 0.5), true)
    assert.equal(allowanceOk(0.005, 0.005), true, 'a cap below one cent')
    assert.equal(allowanceOk(0.015, 0.015), true, 'a cap between cents')
    assert.equal(allowanceOk(0.000001, 0.005), true, 'the least amount')
    assert.equal(allowanceOk(999.999999, 1000), true)
    assert.equal(allowanceOk(0.0000015, 0.005), false, 'finer than Sophia keeps')
    assert.equal(allowanceOk(0, 0.5), false)
    assert.equal(allowanceOk(0.51, 0.5), false, 'above the cap')
  })
})
