import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { levelOf, previewConstraints } from './device-check.ts'

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
})
