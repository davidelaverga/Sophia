import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { handing } from './handed.ts'

const handed = { words: 'How did the launch go?', id: 2 }

describe('words handed from Home to the conversation', () => {
  it('go as the field’s would, once the space can take them', () => {
    assert.equal(handing(handed, 1, true, false), 'send')
  })

  it('wait while another message is on its way', () => {
    assert.equal(handing(handed, 1, true, true), 'wait')
  })

  it('stay in the field, said, while the space can’t take them yet', () => {
    assert.equal(handing(handed, 1, false, false), 'keep')
  })

  it('are taken once: the same handing again, or none, does nothing', () => {
    assert.equal(handing(handed, 2, true, false), 'none')
    assert.equal(handing(null, 0, true, false), 'none')
  })
})
