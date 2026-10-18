import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BAR_MOST, barCount, barFits, barLength } from './bar-length.ts'

test('the room counts characters, an emoji as one; Sophia counts what her chat packet counts', () => {
  assert.equal(barLength('room', '  😀ab  '), 3)
  assert.equal(barLength('sophia', '  😀ab  '), 4)
})

test('the count shows from nine tenths of the most on, and says the most', () => {
  assert.equal(barCount('room', 'a'.repeat(3599)), null)
  assert.deepEqual(barCount('room', 'a'.repeat(3600)), { length: 3600, most: BAR_MOST.room })
  assert.deepEqual(barCount('sophia', 'a'.repeat(1800)), { length: 1800, most: 2000 })
})

test('a message fits up to its most, by who it goes to', () => {
  assert.equal(barFits('room', 'a'.repeat(4000)), true)
  assert.equal(barFits('room', 'a'.repeat(4001)), false)
  assert.equal(barFits('sophia', 'a'.repeat(2000)), true)
  assert.equal(barFits('sophia', 'a'.repeat(2001)), false)
})
