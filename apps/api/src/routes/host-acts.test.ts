import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PartialMute } from '../livekit.ts'
import { recordedIfDone } from './host-acts.ts'

// A host act is recorded only when it happened (docs/plans/activity-followups.md; Codex P2 on #355).
describe('a host act’s evidence', () => {
  it('is not written for an act that did nothing: no microphone, nothing on, no one to mute', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    for (const done of [false, 0]) await recordedIfDone(Promise.resolve(done), record)
    assert.equal(written, 0)
  })

  it('is written once for an act that did something', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    await recordedIfDone(Promise.resolve(true), record)
    await recordedIfDone(Promise.resolve(2), record)
    assert.equal(written, 2)
  })

  it('is written for a batch that failed after muting some, and the failure still answers (Codex on #385)', async () => {
    let written = 0
    const record = () => {
      written += 1
      return Promise.resolve()
    }
    const failure = new PartialMute(1, new Error('room server down'))
    await assert.rejects(recordedIfDone(Promise.reject(failure), record), failure)
    assert.equal(written, 1)
    await assert.rejects(recordedIfDone(Promise.reject(new Error('down')), record), /down/)
    assert.equal(written, 1, 'a failure that changed nothing records nothing')
  })
})
