import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MIC_STILL_ON, switchMicrophone, switchTextMode } from './useTypedChat.ts'

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

/** The microphone's ports in text mode (or not): the device takes the press or refuses it. */
function microphone(textMode: boolean, takes: boolean) {
  const seen: string[] = []
  return {
    seen,
    ports: {
      textMode,
      setDevice: (on: boolean) => {
        seen.push(`microphone ${on}`)
        return Promise.resolve(takes)
      },
      leaveTextMode: () => {
        seen.push('voice')
        return Promise.resolve()
      },
    },
  }
}

describe('the microphone and text mode', () => {
  it('leaves text mode once the microphone came on', async () => {
    const m = microphone(true, true)
    await switchMicrophone(true, m.ports)
    assert.deepEqual(m.seen, ['microphone true', 'voice'])
  })

  it('keeps text mode, and Sophia muted, when the microphone was refused', async () => {
    const m = microphone(true, false)
    await switchMicrophone(true, m.ports)
    assert.deepEqual(m.seen, ['microphone true'])
  })

  it('leaves the mode alone when the microphone goes off, or outside text mode', async () => {
    const off = microphone(true, true)
    await switchMicrophone(false, off.ports)
    assert.deepEqual(off.seen, ['microphone false'])
    const voice = microphone(false, true)
    await switchMicrophone(true, voice.ports)
    assert.deepEqual(voice.seen, ['microphone true'])
  })
})
