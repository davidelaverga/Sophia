import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyPatch, pointerTokens } from './json-patch.ts'

describe('applyPatch', () => {
  const doc = { paths: { '/api/v1/x': { post: { goal: 'S1-05' } } }, schemas: { A: { required: ['a'] } } }

  it('adds, replaces and removes without touching the input', () => {
    const out = applyPatch(doc, [
      { op: 'add', path: '/schemas/B', value: { type: 'object' } },
      { op: 'add', path: '/schemas/A/required/-', value: 'b' },
      { op: 'replace', path: '/paths/~1api~1v1~1x/post/goal', value: 'S1-04' },
      { op: 'remove', path: '/schemas/A/required/0' },
    ])
    assert.deepEqual(out, {
      paths: { '/api/v1/x': { post: { goal: 'S1-04' } } },
      schemas: { A: { required: ['b'] }, B: { type: 'object' } },
    })
    assert.deepEqual(doc.schemas.A.required, ['a'])
  })

  it('fails loudly on a path that does not apply', () => {
    for (const op of [
      { op: 'replace', path: '/schemas/Missing', value: 1 },
      { op: 'remove', path: '/schemas/A/required/3' },
      { op: 'add', path: '/nowhere/deep', value: 1 },
      { op: 'add', path: '', value: 1 },
    ] as const)
      assert.throws(() => applyPatch(doc, [op]), /Path does not exist|Bad array index|whole document/)
  })

  it('unescapes JSON Pointer tokens', () => {
    assert.deepEqual(pointerTokens('/a~1b/c~0d'), ['a/b', 'c~d'])
    assert.throws(() => pointerTokens('a'), /must start/)
  })
})
