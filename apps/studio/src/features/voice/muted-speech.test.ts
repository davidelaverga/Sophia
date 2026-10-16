import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mutedSpeech, mutedWatch } from './muted-speech.ts'

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

/** What the watch opened and let go, in order. */
const recorder = () => {
  const heard: string[] = []
  const listen = (device: string | undefined) => {
    heard.push(`on:${device ?? 'default'}`)
    return () => heard.push(`off:${device ?? 'default'}`)
  }
  return { heard, listen }
}

describe('listening while muted, on the right microphone (Codex P2s on #357)', () => {
  it('a call that begins muted listens from the start', () => {
    const r = recorder()
    mutedWatch(r.listen).set(true, 'mic-a')
    assert.deepEqual(r.heard, ['on:mic-a'])
  })

  it('a microphone switched while muted is listened to instead of the old one; on, it stops', () => {
    const r = recorder()
    const watch = mutedWatch(r.listen)
    watch.set(true, 'mic-a')
    watch.set(true, 'mic-a')
    watch.set(true, 'mic-b')
    watch.set(false, 'mic-b')
    assert.deepEqual(r.heard, ['on:mic-a', 'off:mic-a', 'on:mic-b', 'off:mic-b'])
  })

  it('the call’s end lets it go', () => {
    const r = recorder()
    const watch = mutedWatch(r.listen)
    watch.set(true, undefined)
    watch.end()
    watch.end()
    assert.deepEqual(r.heard, ['on:default', 'off:default'])
  })
})
