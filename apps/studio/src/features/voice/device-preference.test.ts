import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'node:test'
import { chosenDevices, deviceInUse, deviceName, rememberDevice } from './device-preference.ts'

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

describe('the devices a person chose for their calls (call-devices.md)', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true })
  })

  it('keeps each kind’s choice for the next call, one kind never touching another', () => {
    assert.deepEqual(chosenDevices(), {})
    rememberDevice('audioinput', 'usb-mic')
    rememberDevice('videoinput', 'cam-desk')
    rememberDevice('audioinput', 'default')
    assert.deepEqual(chosenDevices(), { audioinput: 'default', videoinput: 'cam-desk' })
  })

  it('reads nothing chosen from storage it can’t read, or holding something else', () => {
    localStorage.setItem('sophia.devices.v1', '{not json')
    assert.deepEqual(chosenDevices(), {})
    localStorage.setItem('sophia.devices.v1', JSON.stringify({ audioinput: 7, videoinput: 'cam', other: 'x' }))
    assert.deepEqual(chosenDevices(), { videoinput: 'cam' })
    Object.defineProperty(globalThis, 'localStorage', {
      get: () => {
        throw new Error('blocked')
      },
      configurable: true,
    })
    assert.deepEqual(chosenDevices(), {})
    assert.doesNotThrow(() => rememberDevice('audioinput', 'usb-mic'))
  })

  it('says which device is in use: the chosen one while it is plugged in, else the default, else the first', () => {
    const mics = [
      { id: 'default', label: 'Default — MacBook Microphone' },
      { id: 'usb-mic', label: 'USB headset' },
    ]
    assert.equal(deviceInUse(mics, 'usb-mic'), 'usb-mic')
    assert.equal(deviceInUse(mics, 'gone'), 'default', 'unplugged since: the default')
    assert.equal(deviceInUse(mics, undefined), 'default')
    assert.equal(
      deviceInUse(
        [
          { id: 'cam-a', label: 'A' },
          { id: 'cam-b', label: 'B' },
        ],
        undefined,
      ),
      'cam-a',
    )
    assert.equal(deviceInUse([], 'usb-mic'), null)
  })

  it('names a device by its own label, or by its kind and place while the browser keeps labels back', () => {
    assert.equal(deviceName('audioinput', 'USB headset', 0), 'USB headset')
    assert.equal(deviceName('audioinput', '', 1), 'Microphone 2')
    assert.equal(deviceName('videoinput', '  ', 0), 'Camera 1')
    assert.equal(deviceName('audiooutput', '', 2), 'Speaker 3')
  })
})
