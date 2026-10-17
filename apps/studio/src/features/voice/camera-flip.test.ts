import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextCamera } from './camera-flip.ts'

const front = { id: 'front', label: 'Front camera' }
const back = { id: 'back', label: 'Back camera' }
const wide = { id: 'wide', label: 'Wide camera' }

test('the camera after the one in use, round: the front, then the back', () => {
  assert.equal(nextCamera([front, back], undefined), 'back', 'none chosen: the first is in use')
  assert.equal(nextCamera([front, back], 'back'), 'front')
  assert.equal(nextCamera([front, back, wide], 'back'), 'wide')
  assert.equal(nextCamera([front, back], 'gone'), 'back', 'a chosen camera unplugged: the first is in use')
})

test('with fewer than two cameras there is nothing to switch to', () => {
  assert.equal(nextCamera([front], 'front'), null)
  assert.equal(nextCamera([], undefined), null)
})
