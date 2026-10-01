import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { draftKey, forgetDrafts } from '../features/personal/draft.ts'
import { signOutForgetting } from './sign-out.ts'

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
