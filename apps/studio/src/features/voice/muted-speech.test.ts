import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mutedSpeech } from './muted-speech.ts'

/** Feed levels a tenth of a second apart from `start`; the times the watch spoke up. */
function run(levels: readonly number[], watch = mutedSpeech(), start = 0): number[] {
  const said: number[] = []
  levels.forEach((level, i) => {
    const at = start + i * 100
    if (watch(level, at)) said.push(at)
  })
  return said
}

describe('«You’re muted» (muted-speech.md)', () => {
  it('a blip says nothing; half a second of speech says it', () => {
    assert.deepEqual(run([0, 0.5, 0.5, 0, 0, 0, 0]), [])
    assert.deepEqual(run([0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), [600])
  })

  it('short gaps don’t break a stretch; a long one starts it again', () => {
    assert.deepEqual(run([0.5, 0.5, 0.5, 0, 0.5, 0.5, 0.5]), [500])
    assert.deepEqual(run([0.5, 0.5, 0.5, 0, 0, 0, 0.5, 0.5, 0.5, 0.5]), [])
  })

  it('quiet levels never say it', () => {
    assert.deepEqual(run(Array.from({ length: 30 }, () => 0.125)), [])
  })

  it('stays quiet for 20 seconds after saying it, then may say it again', () => {
    const watch = mutedSpeech()
    const talk = Array.from({ length: 10 }, () => 0.5)
    assert.deepEqual(run(talk, watch, 0), [500])
    assert.deepEqual(run(talk, watch, 10_000), [])
    assert.deepEqual(run(talk, watch, 21_000), [21_500])
  })
})
