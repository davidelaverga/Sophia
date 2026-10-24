import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allowanceOk, kib, offered, offeredSources, selectionOf, stillChosen } from './review-sources.ts'

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

/** A report version of 100 bytes and the 10-byte sources it cites. */
const report = (id: string, ...supporting: string[]) => ({
  sourceId: id,
  byteLength: 100,
  supporting: supporting.map((s) => ({ sourceId: s, byteLength: 10 })),
})

describe('a report and the sources it cites, chosen together (A43)', () => {
  const offer = [report('r1', 'n1', 'w1'), report('r2', 'w1'), report('r3')]

  it('offers every source once, a source two reports cite included', () => {
    assert.deepEqual(
      offeredSources(offer).map((s) => s.sourceId),
      ['r1', 'n1', 'w1', 'r2', 'r3'],
    )
    assert.deepEqual(selectionOf(offeredSources(offer), ['r1', 'n1'], 32_768), { bytes: 110, over: false })
  })

  it('keeps a cited source only while a report that cites it is chosen and still offered', () => {
    assert.deepEqual(stillChosen(offer, ['r1', 'n1', 'w1']), ['r1', 'n1', 'w1'])
    assert.deepEqual(stillChosen(offer, ['n1', 'w1']), [], 'its report let go: nothing it cites stays chosen')
    assert.deepEqual(stillChosen(offer, ['r2', 'w1', 'n1']), ['r2', 'w1'], 'another chosen report cites w1, not n1')
    assert.deepEqual(
      stillChosen([report('r2', 'w1'), report('r3')], ['r1', 'n1', 'r3']),
      ['r3'],
      'r1 is no longer offered',
    )
    assert.deepEqual(stillChosen([report('r1', 'w1')], ['r1', 'n1']), ['r1'], 'n1 is no longer offered beside r1')
  })
})

describe('where Review sources is offered (E2E-Q3)', () => {
  const pilot = (enabled: boolean, n: number) => ({ enabled, sources: sources.slice(0, n) })

  it('where Sophia enables the pilot and there is something to review', () => {
    assert.equal(offered(pilot(true, 2), false), true)
    assert.equal(offered(pilot(true, 0), false), false, 'nothing to review yet')
    assert.equal(offered(pilot(false, 2), false), false, 'not enabled')
  })

  it('while a proposal is unanswered, so it can be asked about again', () => {
    assert.equal(offered(pilot(true, 0), true), true)
    assert.equal(offered(pilot(false, 0), true), false, 'never where the pilot is not enabled')
  })
})
