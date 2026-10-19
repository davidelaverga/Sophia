import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { asksMicAlone, levelOf, micConstraints, previewConstraints, previewMessage } from './device-check.ts'

describe('the check before joining (device-check.md)', () => {
  it('reads a voice’s level from the microphone’s samples: silence is nothing, a voice moves it, loud fills it', () => {
    const silence = new Uint8Array(256).fill(128)
    assert.equal(levelOf(silence), 0)
    const quiet = Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 === 0 ? 8 : -8))
    const level = levelOf(quiet)
    assert.ok(level > 0.1 && level < 0.5, String(level))
    const loud = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 === 0 ? 255 : 0))
    assert.equal(levelOf(loud), 1)
    assert.equal(levelOf(new Uint8Array(0)), 0)
  })

  it('in steps, so the meter redraws only when it moves', () => {
    const near = Uint8Array.from({ length: 256 }, (_, i) => 128 + (i % 2 === 0 ? 8 : -8))
    // One sample of 256 a little louder: the same step.
    const nearer = Uint8Array.from(near, (s, i) => (i === 0 ? s + 1 : s))
    assert.equal(levelOf(near), levelOf(nearer))
  })

  it('asks for the chosen microphone and camera as wanted, never required, and the defaults otherwise', () => {
    assert.deepEqual(previewConstraints({}), { audio: true, video: { width: { ideal: 640 } } })
    assert.deepEqual(previewConstraints({ audioinput: 'usb-mic', videoinput: 'cam-desk', audiooutput: 'usb-out' }), {
      audio: { deviceId: { ideal: 'usb-mic' } },
      video: { width: { ideal: 640 }, deviceId: { ideal: 'cam-desk' } },
    })
  })

  // Seam #5: a camera missing or busy is no permission to give, and the microphone is still checked alone.
  it('says why there is no picture by the browser’s reason, naming site settings only for a refusal', () => {
    const noCamera = 'No camera found, so this checks your microphone only.'
    const busy = 'Another app is using your camera. Close it to see yourself here; you can still join.'
    const refused = 'Allow the camera and microphone in your browser’s site settings to check them here.'
    const neither = 'The camera and microphone couldn’t start here. You can still join.'
    assert.equal(previewMessage('NotFoundError', true), noCamera)
    assert.equal(previewMessage('OverconstrainedError', true), noCamera)
    assert.equal(previewMessage('NotReadableError', true), busy)
    assert.equal(previewMessage('AbortError', true), busy)
    assert.equal(previewMessage('NotAllowedError', false), refused)
    // The microphone alone failed too: the camera can't be blamed, and no settings are named but for a refusal.
    assert.equal(previewMessage('NotFoundError', false), neither)
    assert.equal(previewMessage('NotReadableError', false), neither)
    assert.equal(previewMessage('SecurityError', false), neither)
    assert.equal(previewMessage('', false), neither)
  })

  it('asks again for the microphone alone only when the camera is missing or busy, never after a refusal', () => {
    for (const name of ['NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError'])
      assert.equal(asksMicAlone(name), true, name)
    for (const name of ['NotAllowedError', 'SecurityError', 'TypeError', ''])
      assert.equal(asksMicAlone(name), false, name)
  })

  it('asks for the microphone alone as chosen, else the default', () => {
    assert.deepEqual(micConstraints({}), { audio: true })
    assert.deepEqual(micConstraints({ audioinput: 'usb-mic', videoinput: 'cam-desk' }), {
      audio: { deviceId: { ideal: 'usb-mic' } },
    })
  })
})
