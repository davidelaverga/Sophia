import assert from 'node:assert/strict'
import { test } from 'node:test'
import { callPresses, cameraPresses, hasTopLayer, nextCamera, switchCamera } from './camera-flip.ts'
import { chosenDevices, rememberDevice } from './device-preference.ts'

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

// A camera chosen elsewhere (Video settings, which a phone turned sideways shows) is the call's: the next press goes on
// from it (Codex P2 on #464).
test('a switch made elsewhere moves the next press on from that camera, not the one already on', async () => {
  const asked: string[] = []
  const press = cameraPresses('front')
  await press([front, back], asking(asked, true))
  press.took('front')
  await press([front, back], asking(asked, true))
  assert.deepEqual(asked, ['back', 'back'], 'two cameras: the other one, not the front already on')

  const round: string[] = []
  const three = cameraPresses('front')
  await three([front, back, wide], asking(round, true))
  three.took('wide')
  await three([front, back, wide], asking(round, true))
  assert.deepEqual(round, ['back', 'front'], 'three cameras: round from the one chosen')
})

/** Switches answered when the test says, each told back once it took (`told`), as the room tells every switch. */
function answeredLater(asked: string[], told: (id: string) => void) {
  const answers: (() => void)[] = []
  const switchTo = (id: string) => {
    asked.push(id)
    return new Promise<boolean>((resolve) => {
      answers.push(() => {
        told(id)
        resolve(true)
      })
    })
  }
  return { switchTo, answer: () => answers.shift()?.() }
}

test('the call’s own switches, told back as any switch is, don’t hold three quick presses back', async () => {
  const asked: string[] = []
  const press = cameraPresses(undefined)
  const later = answeredLater(asked, (id) => press.took(id))
  const first = press([front, back], later.switchTo)
  const second = press([front, back], later.switchTo)
  // The first is answered while the second still waits: the third goes on from the second's camera.
  later.answer()
  await first
  const third = press([front, back], later.switchTo)
  later.answer()
  later.answer()
  await Promise.all([second, third])
  assert.deepEqual(asked, ['back', 'front', 'back'])
})

/** The browser's storage, as a page has it: kept between calls, gone with the page's data. */
function storage(): Storage {
  const kept = new Map<string, string>()
  return {
    get length() {
      return kept.size
    },
    clear: () => kept.clear(),
    getItem: (k) => kept.get(k) ?? null,
    key: (i) => [...kept.keys()][i] ?? null,
    removeItem: (k) => void kept.delete(k),
    setItem: (k, v) => void kept.set(k, v),
  }
}

// Every camera switch in a call goes through one place (`switchCamera`, from the room's own switch), whichever control
// made it, and the call's presses begin there: the seam the fix rests on (a review's P2 on camera-flip-resync.md).
test('a camera switch that took, made anywhere in the call, is where its next press goes on from', async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  assert.equal(await switchCamera(1, 'back', () => Promise.resolve(true)), true)
  const asked: string[] = []
  await callPresses(1)([front, back], asking(asked, true))
  assert.deepEqual(asked, ['front'], 'the back is on: the front, not the back again')
})

test('a camera Video settings couldn’t switch to, kept for the next call all the same, is asked again by the first press', async () => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  rememberDevice('videoinput', 'front')
  // The room keeps a choice before it switches (`deviceSwitch`, useProjectRoom.ts), and keeps it if refused.
  const refused = await switchCamera(2, 'back', () => {
    rememberDevice('videoinput', 'back')
    return Promise.resolve(false)
  })
  assert.equal(refused, false)
  assert.equal(chosenDevices().videoinput, 'back', 'kept for the next call')
  const asked: string[] = []
  await callPresses(2)([front, back], asking(asked, true))
  assert.deepEqual(asked, ['back'], 'the call is still on the front: the back, asked again')
})

// Your tile's menu on a phone's strip stands in the top layer (the Popover API), which Safari before 17 lacks; the build
// targets Safari 16.4 (a review's P1 on this branch).
test('the top layer is there where the browser shows popovers, not in Safari before 17 nor without a page', () => {
  assert.equal(hasTopLayer({ showPopover: () => undefined }), true)
  assert.equal(hasTopLayer({}), false, 'Safari 16: no showPopover')
  assert.equal(hasTopLayer(undefined), false)
  assert.equal(hasTopLayer(), false, 'here, no HTMLElement')
})
