import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MIC_STILL_ON, switchTextMode } from './useTypedChat.ts'

/** Text mode's ports, recording what was asked of them; the microphone goes off or doesn't. */
function ports(silenced: boolean) {
  const seen: string[] = []
  return {
    seen,
    remember: (on: boolean) => {
      seen.push(`remember ${on}`)
    },
    connection: {
      current: {
        setTextMode: (on: boolean) => {
          seen.push(`room ${on}`)
        },
      },
    },
    silence: () => {
      seen.push('silence')
      return Promise.resolve(silenced)
    },
  }
}

describe('text mode', () => {
  it('starts once the microphone is off', async () => {
    const p = ports(true)
    await switchTextMode(true, p)
    assert.deepEqual(p.seen, ['remember true', 'room true', 'silence'])
  })

  it('goes back off, and says why, when the microphone could not be turned off', async () => {
    const p = ports(false)
    await assert.rejects(switchTextMode(true, p), { message: MIC_STILL_ON })
    assert.deepEqual(p.seen, ['remember true', 'room true', 'silence', 'remember false', 'room false'])
  })

  it('asks nothing of the microphone when it goes off', async () => {
    const p = ports(false)
    await switchTextMode(false, p)
    assert.deepEqual(p.seen, ['remember false', 'room false'])
  })
})
