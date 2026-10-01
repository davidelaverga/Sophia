import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { leaveFor, PENDING, refuseOtherAccount, type ProviderAuth } from './provider-leave.ts'
import { CHECK_WORDS } from './unlock-check.ts'

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
    Reflect.set(globalThis, 'sessionStorage', { setItem: () => undefined })
    try {
      await leaveFor('github', new AbortController().signal, client, 1000)
    } finally {
      Reflect.deleteProperty(globalThis, 'window')
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
    assert.deepEqual(started, ['github'])
  })

  it('starts no sign-in when this tab can’t note which sign-in left: its return couldn’t be checked', async () => {
    const { started, client } = auth(() => undefined)
    Reflect.set(globalThis, 'sessionStorage', {
      setItem: () => {
        throw new Error('blocked')
      },
    })
    try {
      await assert.rejects(leaveFor('github', new AbortController().signal, client, 1000), {
        message: CHECK_WORDS.storage,
      })
    } finally {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
    assert.deepEqual(started, [])
  })
})

/**
 * This tab's sessionStorage, holding `pending` as the check an unlock left with; the sign-outs asked of Auth, and
 * whether the session is still there after one (`stays`: a sign-out that failed).
 */
function returning(pending: object | null, stays = false) {
  const held = new Map<string, string>(pending ? [[PENDING, JSON.stringify(pending)]] : [])
  Reflect.set(globalThis, 'sessionStorage', {
    getItem: (k: string) => held.get(k) ?? null,
    removeItem: (k: string) => void held.delete(k),
  })
  const scopes: string[] = []
  const signing = {
    signOut: (o: { scope: string }) => {
      scopes.push(o.scope)
      return Promise.resolve({ error: stays ? new Error('offline') : null })
    },
    getSession: () => Promise.resolve({ data: { session: stays ? { user: { id: 'ben' } } : null }, error: null }),
  }
  return { held, scopes, client: signing as unknown as Parameters<typeof refuseOtherAccount>[0] }
}

describe('back from the provider', () => {
  const left = { user: 'ana', session: 's1', at: Date.now() }

  it('another account than the one that left: its session ends here, and nobody is signed in', async () => {
    const { held, scopes, client } = returning(left)
    try {
      assert.equal(await refuseOtherAccount(client, 'ben'), true)
    } finally {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
    assert.deepEqual(scopes, ['local'])
    assert.equal(held.has(PENDING), false)
  })

  it('its sign-out failed, the session still here: the check stays, so a reload refuses it again', async () => {
    const { held, scopes, client } = returning(left, true)
    try {
      assert.equal(await refuseOtherAccount(client, 'ben'), true)
    } finally {
      Reflect.deleteProperty(globalThis, 'sessionStorage')
    }
    assert.deepEqual(scopes, ['local'])
    assert.equal(held.has(PENDING), true)
  })

  it('the same account, or no unlock pending: the session is left as it is', async () => {
    for (const [pending, user] of [
      [left, 'ana'],
      [null, 'ben'],
      [left, null],
    ] as const) {
      const { scopes, client } = returning(pending)
      try {
        assert.equal(await refuseOtherAccount(client, user), false)
      } finally {
        Reflect.deleteProperty(globalThis, 'sessionStorage')
      }
      assert.deepEqual(scopes, [])
    }
  })
})
