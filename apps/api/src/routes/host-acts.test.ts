import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
})
