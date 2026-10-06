import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { newCall } from './useProjectRoom.ts'

describe('a call’s number', () => {
  it('is never another’s, whichever room begins it, even one mounted again (Codex on #138)', () => {
    const numbers = Array.from({ length: 5 }, newCall)
    assert.equal(new Set(numbers).size, numbers.length)
    assert.ok(numbers.every((n, i) => i === 0 || n > (numbers[i - 1] ?? 0)))
  })
})
