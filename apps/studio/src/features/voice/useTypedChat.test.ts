import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { arriveWithMicrophone, enterCall, MIC_STILL_ON, switchMicrophone, switchTextMode } from './useTypedChat.ts'

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

/**
 * The microphone's ports: text mode before the press, and as it is once the device answers (it can begin while the
 * browser asks); the device takes the press or refuses it.
 */
function microphone(before: boolean, takes: boolean, after = before) {
  const seen: string[] = []
  let typing = before
  return {
    seen,
    ports: {
      textMode: () => typing,
      setDevice: (on: boolean) => {
        seen.push(`microphone ${on}`)
        typing = after
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

  it('leaves text mode that began while the browser was still asking for it', async () => {
    const m = microphone(false, true, true)
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

/** A microphone arriving with a join: it comes on or not, text mode begins meanwhile or not, it goes off again or not. */
function arrival(comesOn: boolean, typing: boolean, goesOff: boolean) {
  const seen: string[] = []
  let typingNow = false
  return {
    seen,
    ports: {
      enable: () => {
        seen.push('on')
        typingNow = typing // text mode begins while the browser asks
        return Promise.resolve(comesOn)
      },
      textMode: () => typingNow,
      disable: () => {
        seen.push('off')
        return Promise.resolve(goesOff)
      },
    },
  }
}

describe('the microphone on arrival', () => {
  it('stays on by voice', async () => {
    const a = arrival(true, false, true)
    assert.equal(await arriveWithMicrophone(a.ports), true)
    assert.deepEqual(a.seen, ['on'])
  })

  it('goes off again when text mode began while it came on', async () => {
    const a = arrival(true, true, true)
    assert.equal(await arriveWithMicrophone(a.ports), true)
    assert.deepEqual(a.seen, ['on', 'off'])
  })

  it('says text mode can’t hold when it couldn’t go off again', async () => {
    const a = arrival(true, true, false)
    assert.equal(await arriveWithMicrophone(a.ports), false)
    assert.deepEqual(a.seen, ['on', 'off'])
  })

  it('asks nothing more when it didn’t come on: text mode holds', async () => {
    const a = arrival(false, true, false)
    assert.equal(await arriveWithMicrophone(a.ports), true)
    assert.deepEqual(a.seen, ['on'])
  })
})

/** A join that got in: text mode as it is now, the microphone remembered on or off, and whether its arrival held. */
function entry(typed: boolean, micOn: boolean, held: boolean) {
  const seen: string[] = []
  return {
    seen,
    ports: {
      textModeNow: () => typed,
      applyTextMode: (on: boolean) => {
        seen.push(`room ${on}`)
      },
      shown: () => {
        seen.push('live')
      },
      micOnArrival: () => micOn,
      arrive: () => {
        seen.push('arrive')
        return Promise.resolve(held)
      },
      leaveTextMode: () => {
        seen.push('voice')
        return Promise.resolve()
      },
    },
  }
}

describe('a join that got in', () => {
  it('applies text mode as it is now, then brings the microphone by voice', async () => {
    const e = entry(false, true, true)
    await enterCall(e.ports)
    assert.deepEqual(e.seen, ['room false', 'live', 'arrive'])
  })

  it('keeps the microphone off in text mode, and as this device left it', async () => {
    const typed = entry(true, true, true)
    await enterCall(typed.ports)
    assert.deepEqual(typed.seen, ['room true', 'live'])
    const muted = entry(false, false, true)
    await enterCall(muted.ports)
    assert.deepEqual(muted.seen, ['room false', 'live'])
  })

  it('goes back to voice when text mode began while the microphone came on, and it stayed on', async () => {
    const e = entry(false, true, false)
    await enterCall(e.ports)
    assert.deepEqual(e.seen, ['room false', 'live', 'arrive', 'voice'])
  })
})
