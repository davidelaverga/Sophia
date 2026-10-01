import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { leaveFor, type ProviderAuth } from './provider-leave.ts'

/** An Auth client whose session read `during` runs during (as the person closes the sheet); the sign-ins it starts. */
function auth(during: () => void) {
  const started: string[] = []
  const client = {
    getSession: () => {
      during()
      return Promise.resolve({ data: { session: null }, error: null })
    },
    getUser: () => Promise.reject(new Error('not asked: nobody is signed in here')),
    signInWithOAuth: (o: { provider: string }) => {
      started.push(o.provider)
      return Promise.resolve({ data: { provider: o.provider, url: '' }, error: null })
    },
  }
  return { started, client: client as unknown as ProviderAuth }
}

describe('unlocking with a provider', () => {
  it('starts no sign-in once its sheet went while it read who is signed in: the page stays', async () => {
    const stop = new AbortController()
    const { started, client } = auth(() => stop.abort())
    await leaveFor('github', stop.signal, client, 1000)
    assert.deepEqual(started, [])
  })

  it('control: with its sheet still there, it leaves for the provider', async () => {
    const { started, client } = auth(() => undefined)
    Reflect.set(globalThis, 'window', { location: { origin: 'http://studio.test' } })
    try {
      await leaveFor('github', new AbortController().signal, client, 1000)
    } finally {
      Reflect.deleteProperty(globalThis, 'window')
    }
    assert.deepEqual(started, ['github'])
  })
})
