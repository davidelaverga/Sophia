import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { REJOIN_WINDOW_MS } from './call-rejoin.ts'
import { markText, readMark, type ReloadMark } from './reload-mark.ts'

const mark: ReloadMark = { project: 'p1', account: 'a1', at: 1_000, mic: false, textMode: true }

describe('a call a reload left (call-way-back.md)', () => {
  it('is offered back as it was, for its project and account, while recent', () => {
    assert.deepEqual(readMark(markText(mark), 'p1', 'a1', 6_000), mark)
  })

  it('offers nothing for another project, another account, or once the call has moved on', () => {
    assert.equal(readMark(markText(mark), 'p2', 'a1', 6_000), null)
    assert.equal(readMark(markText(mark), 'p1', 'a2', 6_000), null)
    assert.equal(readMark(markText(mark), 'p1', 'a1', 1_000 + REJOIN_WINDOW_MS + 1), null)
    assert.equal(readMark(markText(mark), 'p1', 'a1', 500), null, 'a clock set back')
  })

  it('reads nothing from nothing, or from what isn’t one', () => {
    assert.equal(readMark(null, 'p1', 'a1', 6_000), null)
    assert.equal(readMark('not json', 'p1', 'a1', 6_000), null)
    assert.equal(readMark('{"project":"p1","account":"a1"}', 'p1', 'a1', 6_000), null)
  })

  it('never reads a microphone as on unless it was', () => {
    const raw = JSON.stringify({ ...mark, mic: 'yes' })
    assert.equal(readMark(raw, 'p1', 'a1', 6_000)?.mic, false)
  })
})
