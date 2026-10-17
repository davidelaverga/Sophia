import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pushToTalk, type TalkKey } from './push-to-talk.ts'

// Push to talk (docs/plans/push-to-talk.md): Space held while muted, from nowhere.
const space: TalkKey = { key: ' ', repeat: false, modified: false, fromNowhere: true, modal: false }
const muted = { micOn: false, holding: false }

describe('push to talk', () => {
  it('starts from nowhere, muted, on Space alone with no sheet open', () => {
    assert.equal(pushToTalk('down', space, muted), 'start')
  })

  it('leaves the key alone anywhere else: a control, a modifier, a sheet, another key, the mic on', () => {
    assert.equal(pushToTalk('down', { ...space, fromNowhere: false }, muted), null)
    assert.equal(pushToTalk('down', { ...space, modified: true }, muted), null)
    assert.equal(pushToTalk('down', { ...space, modal: true }, muted), null)
    assert.equal(pushToTalk('down', { ...space, key: 'a' }, muted), null)
    assert.equal(pushToTalk('down', space, { micOn: true, holding: false }), null)
  })

  it('swallows repeats while held, and stops on release', () => {
    const held = { micOn: true, holding: true }
    assert.equal(pushToTalk('down', { ...space, repeat: true }, held), 'swallow')
    assert.equal(pushToTalk('up', space, held), 'stop')
    assert.equal(pushToTalk('up', space, muted), null)
  })
})
