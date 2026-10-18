import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { sophiaVoice } from './sophia-voice.ts'

// Text mode stays quiet (docs/plans/text-mode-quiet.md): read, Sophia's voice has no element to play in, so nothing
// can unmute it; heard, it plays. Her tracks stay; their elements come and go.
const voice = () => {
  const said: string[] = []
  const sophia = sophiaVoice<string>({
    attach: (track) => said.push(`attach ${track}`),
    detach: (track) => said.push(`detach ${track}`),
  })
  return { said, sophia }
}

describe('Sophia’s voice in text mode', () => {
  it('plays a track that arrives while she is heard', () => {
    const { said, sophia } = voice()
    sophia.add('mic')
    assert.deepEqual(said, ['attach mic'])
  })

  it('keeps a track that arrives while she is read waiting, and plays it when text mode ends', () => {
    const { said, sophia } = voice()
    sophia.setRead(true)
    sophia.add('mic')
    assert.deepEqual(said, [])
    sophia.setRead(false)
    assert.deepEqual(said, ['attach mic'])
  })

  it('takes what plays out of the page when text mode begins', () => {
    const { said, sophia } = voice()
    sophia.add('mic')
    sophia.setRead(true)
    assert.deepEqual(said, ['attach mic', 'detach mic'])
  })

  it('does nothing for the mode it is already in', () => {
    const { said, sophia } = voice()
    sophia.add('mic')
    sophia.setRead(false)
    sophia.setRead(true)
    sophia.setRead(true)
    assert.deepEqual(said, ['attach mic', 'detach mic'])
  })

  it('never brings back a track that left while she was read', () => {
    const { said, sophia } = voice()
    sophia.setRead(true)
    sophia.add('mic')
    sophia.remove('mic')
    sophia.setRead(false)
    assert.deepEqual(said, [])
  })
})
