import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cacheFor, cacheOf, forgetPersonalReads } from './account-cache.ts'

const DAVIDE = '00000000-0000-4000-8000-00000000d001'
const OTHER = '00000000-0000-4000-8000-00000000d002'

describe('each account has its own cache (Codex’s review of a06db118)', () => {
  it('the same account keeps its cache; another, even at the same address, starts on an empty one', () => {
    const davide = cacheOf(DAVIDE)
    davide.client.setQueryData(['review-availability', 'project-1', 'davide@sophia.test'], { enabled: true })
    assert.equal(cacheFor(davide, DAVIDE), davide, 'an email change keeps the account, and its cache')
    const other = cacheFor(davide, OTHER)
    assert.notEqual(other.client, davide.client)
    assert.equal(other.account, OTHER)
    assert.equal(
      other.client.getQueryData(['review-availability', 'project-1', 'davide@sophia.test']),
      undefined,
      'what was read for Davide, under the address both share, is not in the next account’s cache',
    )
    assert.equal(cacheFor(davide, null).client.getQueryCache().getAll().length, 0, 'nobody in: an empty one too')
  })

  it('the padlock forgets every personal read, under the old address and the new, and nothing else', () => {
    const { client } = cacheOf(DAVIDE)
    client.setQueryData(['personal', 'davide@sophia.test'], { notes: ['before the address changed'] })
    client.setQueryData(['personal', 'davide.new@sophia.test'], { notes: ['after'] })
    client.setQueryData(['projects', 'davide.new@sophia.test'], { projects: [] })
    forgetPersonalReads(client)
    assert.equal(client.getQueryData(['personal', 'davide@sophia.test']), undefined)
    assert.equal(client.getQueryData(['personal', 'davide.new@sophia.test']), undefined)
    assert.deepEqual(client.getQueryData(['projects', 'davide.new@sophia.test']), { projects: [] })
  })
})
