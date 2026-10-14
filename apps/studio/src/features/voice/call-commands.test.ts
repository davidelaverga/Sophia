import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { callCommands } from './call-commands.ts'

const sent: string[] = []
const controls = {
  setMicrophone: (on: boolean) => void sent.push(`microphone ${String(on)}`),
  setCamera: (on: boolean) => void sent.push(`camera ${String(on)}`),
  setScreenShare: (on: boolean) => void sent.push(`screen ${String(on)}`),
  leave: () => void sent.push('leave'),
}
const offered = (sending: { microphone: boolean; camera: boolean; screen: boolean }, withLeave = true) =>
  callCommands(sending, withLeave ? controls : { ...controls, leave: undefined }).filter((c) => c.run)

describe('the call’s keys beyond the dock (docs/plans/call-keys-anywhere.md)', () => {
  it('the microphone goes both ways on mod+d, as its switch there does', () => {
    const on = offered({ microphone: true, camera: false, screen: false }).find((c) => c.id === 'microphone')
    assert.equal(on?.words, 'Microphone off')
    assert.equal(on?.key, 'mod+d')
    sent.length = 0
    on?.run?.()
    assert.deepEqual(sent, ['microphone false'])
    const off = offered({ microphone: false, camera: false, screen: false }).find((c) => c.id === 'microphone')
    assert.equal(off?.words, 'Microphone on')
    sent.length = 0
    off?.run?.()
    assert.deepEqual(sent, ['microphone true'])
  })

  it('the camera and the screen are offered only while on, and only turn off', () => {
    const quiet = offered({ microphone: true, camera: false, screen: false }).map((c) => c.id)
    assert.ok(!quiet.includes('camera'))
    assert.ok(!quiet.includes('screen'))
    const sending = offered({ microphone: true, camera: true, screen: true })
    const camera = sending.find((c) => c.id === 'camera')
    const screen = sending.find((c) => c.id === 'screen')
    assert.equal(camera?.words, 'Camera off')
    assert.equal(camera?.key, 'mod+e')
    assert.equal(screen?.words, 'Stop sharing the screen')
    assert.equal(screen?.key, 'mod+shift+e')
    sent.length = 0
    camera?.run?.()
    screen?.run?.()
    assert.deepEqual(sent, ['camera false', 'screen false'])
  })

  it('Leave is offered where it is given, with no key', () => {
    const leave = offered({ microphone: true, camera: false, screen: false }).find((c) => c.id === 'leave')
    assert.equal(leave?.words, 'Leave the room')
    assert.equal(leave?.key, undefined)
    assert.equal(
      offered({ microphone: true, camera: false, screen: false }, false).find((c) => c.id === 'leave'),
      undefined,
    )
  })

  it('every command is the room’s', () => {
    assert.ok(offered({ microphone: true, camera: true, screen: true }).every((c) => c.group === 'room'))
  })
})
