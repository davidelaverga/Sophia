// The digest a bound voice tool call's key is claimed with (0047; Codex P1 r4233409532 on PR #190), level: unit. A
// provider call id reused for the same tool with other arguments is another call, so the claim compares the arguments
// too; it keeps only this digest. The real claim, through the API and on PostgreSQL, is voice-qualification.db.
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callArgsSha256 } from './media-tools.ts'

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex')

describe('a call’s arguments digest (callArgsSha256)', () => {
  it('is SHA-256 over their canonical JSON: keys sorted at every depth, no whitespace, arrays in order', () => {
    assert.equal(callArgsSha256({}), sha256('{}'))
    assert.equal(callArgsSha256({ taskId: 't', action: 'hold' }), sha256('{"action":"hold","taskId":"t"}'))
    assert.equal(
      callArgsSha256({ b: { d: [2, { f: 1, e: 0 }], c: 'é' }, a: null }),
      sha256('{"a":null,"b":{"c":"é","d":[2,{"e":0,"f":1}]}}'),
    )
    assert.match(callArgsSha256({ a: 1 }), /^[0-9a-f]{64}$/)
  })

  it('the same arguments in another key order are the same call; any other value, member or order is another', () => {
    const args = { taskId: 't', action: 'hold', detail: { b: 1, a: [1, { d: 2, c: 3 }] } }
    const digest = callArgsSha256(args)
    assert.equal(callArgsSha256({ detail: { a: [1, { c: 3, d: 2 }], b: 1 }, action: 'hold', taskId: 't' }), digest)
    const others = [
      { ...args, action: 'resume' },
      { ...args, detail: { b: 1, a: [{ d: 2, c: 3 }, 1] } },
      { ...args, detail: { b: '1', a: [1, { d: 2, c: 3 }] } },
      { taskId: 't', action: 'hold' },
      { ...args, brief: null },
    ]
    for (const other of others) assert.notEqual(callArgsSha256(other), digest, JSON.stringify(other))
  })
})
