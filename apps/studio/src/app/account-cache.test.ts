import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ApiError } from '../api/client.ts'
import { cacheFor, cacheOf, forgetPersonalReads, retryRead } from './account-cache.ts'

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

describe('a refusal that will not change is not asked again (e2e-real Q2)', () => {
  const forbidden = new ApiError(403, 'forbidden', 'Not permitted', 'never')
  const unavailable = new ApiError(503, 'unavailable', 'Try again', 'safe_read')
  it('a refusal the API marks retry never is not retried; anything else, three times as before', () => {
    assert.equal(retryRead(0, forbidden), false)
    assert.equal(retryRead(0, unavailable), true)
    assert.equal(retryRead(2, unavailable), true)
    assert.equal(retryRead(3, unavailable), false)
    assert.equal(retryRead(0, new TypeError('Failed to fetch')), true)
  })
  it('every account’s cache asks its reads that way', () => {
    assert.equal(cacheOf(DAVIDE).client.getDefaultOptions().queries?.retry, retryRead)
  })
})

describe('the padlock forgets the room’s mentions read too: the person’s mixed Needs (P1 4309009938)', () => {
  it('every account, cursor and older shape of it goes, the read on its way is stopped, and nothing else goes', async () => {
    const { client } = cacheOf(DAVIDE)
    const mixed = { needs: [{ id: 'reply:t9', kind: 'reply', title: 'SENTINEL personal words' }] }
    client.setQueryData(['mentions', 'needs', DAVIDE, 'cursor-1'], mixed)
    client.setQueryData(['mentions', 'needs', DAVIDE, 'cursor-2'], mixed)
    client.setQueryData(['mentions', 'needs', OTHER, undefined], mixed)
    client.setQueryData(['mentions', 'needs', 'davide@sophia.test'], mixed) // an older key, by address
    client.setQueryData(['conversations', 'project-1', DAVIDE], { list: [] })
    client.setQueryData(['tasks', 'project-1'], { tasks: [] })
    let aborted = false
    let answer: (value: typeof mixed) => void = () => {}
    const late = client.fetchQuery({
      queryKey: ['mentions', 'needs', DAVIDE, 'cursor-3'],
      queryFn: ({ signal }) =>
        new Promise<typeof mixed>((resolve) => {
          signal.addEventListener('abort', () => (aborted = true))
          answer = resolve
        }),
    })
    forgetPersonalReads(client)
    assert.equal(aborted, true, 'the read on its way is stopped')
    answer(mixed) // it answers anyway, late
    await late.catch(() => undefined)
    assert.deepEqual(client.getQueriesData({ queryKey: ['mentions', 'needs'] }), [], 'nothing of the list is kept')
    assert.deepEqual(client.getQueryData(['conversations', 'project-1', DAVIDE]), { list: [] })
    assert.deepEqual(client.getQueryData(['tasks', 'project-1']), { tasks: [] })
  })
})
