import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { draftKey, forgetDrafts } from '../features/personal/draft.ts'
import { endSession, EVERYWHERE, NOT_EVERYWHERE, signedOutAfter, signOutForgetting } from './sign-out.ts'

/** A browser's localStorage, as forgetDrafts lists it. */
function storage() {
  const held = new Map<string, string>()
  return {
    held,
    get length() {
      return held.size
    },
    key: (i: number) => [...held.keys()][i] ?? null,
    removeItem: (k: string) => void held.delete(k),
  }
}

describe('signing out', () => {
  it('forgets a draft written while the sign-out was on its way', async () => {
    const store = storage()
    store.held.set(draftKey('ana'), 'Before')
    const slowly = () => {
      store.held.set(draftKey('ana'), 'Typed meanwhile')
      return Promise.resolve()
    }
    await signOutForgetting(slowly, () => forgetDrafts(store))
    assert.deepEqual([...store.held.keys()], [])
  })

  it('forgets them also when the sign-out failed', async () => {
    const store = storage()
    const failing = () => {
      store.held.set(draftKey('ana'), 'Back from a send that failed')
      return Promise.reject(new Error('offline'))
    }
    await assert.rejects(signOutForgetting(failing, () => forgetDrafts(store)))
    assert.deepEqual([...store.held.keys()], [])
  })
})

/**
 * An Auth client as supabase-js answers a sign-out: its result, and whether this device's session goes, which
 * supabase-js says to its listeners (SIGNED_OUT) before the call resolves.
 */
function client(error: Error | null, removes: boolean) {
  const asked: unknown[] = []
  const heard = new Set<(event: string) => void>()
  return {
    asked,
    onAuthStateChange: (callback: (event: string) => void) => {
      heard.add(callback)
      return { data: { subscription: { unsubscribe: () => heard.delete(callback) } } }
    },
    signOut: (options: { scope: 'local' | 'global' }) => {
      asked.push(options)
      if (removes) for (const callback of heard) callback('SIGNED_OUT')
      return Promise.resolve({ error })
    },
  }
}

describe('ending the session (sign-out-scope.md)', () => {
  it('signs out this device only, and every device only when asked', async () => {
    const auth = client(null, true)
    assert.equal(await endSession(auth, false), 'ended')
    assert.equal(await endSession(auth, true), 'ended')
    assert.deepEqual(auth.asked, [{ scope: 'local' }, { scope: 'global' }])
  })
})

describe('a sign-out everywhere that only signs out here (Codex P1 on #410)', () => {
  it('says when every device was asked and only this one is out: the logout failed, this session removed', async () => {
    // A 5xx from the logout: supabase-js 2.117.1 removes this device's session, then resolves with `{ error }`.
    assert.equal(await endSession(client(new Error('503'), true), true), 'here-only')
    // This device's own sign-out has nothing more to say: its session is gone.
    assert.equal(await endSession(client(new Error('503'), true), false), 'ended')
  })

  it('a failure that removed nothing is a sign-out that failed: the person is still in', async () => {
    // An expired token whose refresh failed: supabase-js returns that error before removing anything.
    await assert.rejects(endSession(client(new Error('refresh failed'), false), true))
    await assert.rejects(endSession(client(new Error('refresh failed'), false), false))
  })

  it('the sign-in says the other devices may still be signed in', () => {
    assert.deepEqual(signedOutAfter('ended'), { status: 'signed_out' })
    assert.deepEqual(signedOutAfter('here-only'), { status: 'signed_out', notice: NOT_EVERYWHERE })
    assert.match(NOT_EVERYWHERE, /other devices may still be signed in/)
  })
})

describe('what «Sign out of all devices» says (Codex P1 on #410, third)', () => {
  it('says the other devices go within the hour, not at once: their access token lives until it expires', () => {
    // A global sign-out revokes the refresh tokens; an access token already given lives to its expiry (jwt_expiry
    // 3600 s in supabase/config.toml, Supabase's default), and the API checks only its signature and expiry.
    assert.deepEqual(EVERYWHERE, {
      label: 'Sign out of all devices',
      warning:
        'This one signs out now. Your other devices are signed out within an hour, when their sign-in next renews.',
      confirm: 'Sign out everywhere',
      keep: 'Stay signed in',
    })
  })
})
