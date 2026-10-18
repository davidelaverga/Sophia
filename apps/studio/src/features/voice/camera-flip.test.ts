import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cameraPresses, nextCamera } from './camera-flip.ts'

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

// The presses of one call follow the camera the call is on, never the kept choice after its first (Codex P2 on #422).
const asking = (asked: string[], took: boolean) => (id: string) => {
  asked.push(id)
  return Promise.resolve(took)
}

test('with nothing kept (storage that can’t be written), the presses still go round: the back, then the front', async () => {
  const asked: string[] = []
  const press = cameraPresses(undefined)
  await press([front, back], asking(asked, true))
  await press([front, back], asking(asked, true))
  assert.deepEqual(asked, ['back', 'front'])
})

test('a switch refused leaves the call where it was: the next press asks for the same camera', async () => {
  const asked: string[] = []
  const press = cameraPresses('front')
  await press([front, back], asking(asked, false))
  await press([front, back], asking(asked, true))
  await press([front, back], asking(asked, true))
  assert.deepEqual(asked, ['back', 'back', 'front'])
})

test('two presses before the first is answered go round, as two answered would', async () => {
  const asked: string[] = []
  const press = cameraPresses(undefined)
  await Promise.all([press([front, back], asking(asked, true)), press([front, back], asking(asked, true))])
  assert.deepEqual(asked, ['back', 'front'])
})
