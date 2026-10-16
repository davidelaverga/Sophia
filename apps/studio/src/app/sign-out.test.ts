import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { draftKey, forgetDrafts } from '../features/personal/draft.ts'
import { endSession, NOT_EVERYWHERE, signedOutAfter, signOutForgetting } from './sign-out.ts'

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

describe('ending the session (sign-out-scope.md)', () => {
  it('signs out this device only, and every device only when asked', async () => {
    const asked: unknown[] = []
    const auth = {
      signOut: (options: { scope: 'local' | 'global' }) => {
        asked.push(options)
        return Promise.resolve({ error: null })
      },
    }
    await endSession(auth, false)
    await endSession(auth, true)
    assert.deepEqual(asked, [{ scope: 'local' }, { scope: 'global' }])
  })
})

describe('a sign-out everywhere that only signs out here (Codex P1 on #410)', () => {
  // supabase-js resolves a failed logout (a 5xx, the network) with `{ error }`, this device's session removed anyway.
  const failing = { signOut: () => Promise.resolve({ error: new Error('503') }) }
  const fine = { signOut: () => Promise.resolve({ error: null }) }

  it('says when every device was asked and only this one is out', async () => {
    assert.equal(await endSession(failing, true), 'here-only')
    assert.equal(await endSession(fine, true), 'ended')
    // This device's own sign-out has nothing more to say: its session is gone either way.
    assert.equal(await endSession(failing, false), 'ended')
  })

  it('the sign-in says the other devices may still be signed in', () => {
    assert.deepEqual(signedOutAfter('ended'), { status: 'signed_out' })
    assert.deepEqual(signedOutAfter('here-only'), { status: 'signed_out', notice: NOT_EVERYWHERE })
    assert.match(NOT_EVERYWHERE, /other devices may still be signed in/)
  })
})
