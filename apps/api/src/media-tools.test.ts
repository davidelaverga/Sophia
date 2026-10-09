// The digest a bound voice tool call's key is claimed with (0047; Codex P1 r4233409532 and r4233923450 on PR #190),
// level: unit. A provider call id reused for the same tool with other arguments, in a later utterance, in another input
// mode or under another guide is another call, so the claim compares all of what the handlers read; it keeps only this
// digest. The real claim, through the API and on PostgreSQL, is voice-qualification.db.
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { MediaToolCall } from '@sophia/contracts'
import { callSha256 } from './media-tools.ts'

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

type Read = Pick<MediaToolCall, 'args' | 'utterance' | 'inputMode' | 'guide'>

describe('a call’s digest (callSha256)', () => {
  it('is SHA-256 over the canonical JSON of its arguments, utterance, input mode and guide, an absent one as null', () => {
    assert.equal(callSha256({ args: {} }), sha256('{"args":{},"guide":null,"inputMode":null,"utterance":null}'))
    assert.equal(
      callSha256({ args: { taskId: 't', action: 'hold' }, utterance: 4, inputMode: 'voice', guide: 'v1.2' }),
      sha256('{"args":{"action":"hold","taskId":"t"},"guide":"v1.2","inputMode":"voice","utterance":4}'),
    )
    assert.equal(
      callSha256({ args: { b: { d: [2, { f: 1, e: 0 }], c: 'é' }, a: null } }),
      sha256('{"args":{"a":null,"b":{"c":"é","d":[2,{"e":0,"f":1}]}},"guide":null,"inputMode":null,"utterance":null}'),
    )
    assert.match(callSha256({ args: { a: 1 } }), /^[0-9a-f]{64}$/)
  })

  it('the same call in another key order is the same call; any other value, member, order or context is another', () => {
    const call: Read = {
      args: { taskId: 't', action: 'hold', detail: { b: 1, a: [1, { d: 2, c: 3 }] } },
      utterance: 4,
      inputMode: 'voice',
      guide: 'v1.2',
    }
    const digest = callSha256(call)
    assert.equal(
      callSha256({
        guide: 'v1.2',
        inputMode: 'voice',
        utterance: 4,
        args: { detail: { a: [1, { c: 3, d: 2 }], b: 1 }, action: 'hold', taskId: 't' },
      }),
      digest,
    )
    const others: Read[] = [
      { ...call, args: { ...call.args, action: 'resume' } },
      { ...call, args: { ...call.args, detail: { b: 1, a: [{ d: 2, c: 3 }, 1] } } },
      { ...call, args: { ...call.args, detail: { b: '1', a: [1, { d: 2, c: 3 }] } } },
      { ...call, args: { taskId: 't', action: 'hold' } },
      { ...call, args: { ...call.args, brief: null } },
      { ...call, utterance: 5 },
      { ...call, inputMode: 'text' },
      { ...call, guide: 'v1.3' },
    ]
    for (const other of others) assert.notEqual(callSha256(other), digest, JSON.stringify(other))
  })

  it('an absent utterance, input mode or guide is not any present one', () => {
    const present: Read = { args: {}, utterance: 0, inputMode: 'voice', guide: 'v1.1' }
    for (const field of ['utterance', 'inputMode', 'guide'] as const) {
      const absent: Read = { ...present }
      delete absent[field]
      assert.notEqual(callSha256(absent), callSha256(present), field)
    }
  })
})
