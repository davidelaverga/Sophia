import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { apiFetch, renewTokensWith, type ResendableInit } from './renew.ts'

// The reliability baseline's gap #3 (docs/plans/auth-session-renewal.md): a 401 renews the token once and the same
// request goes again with it; anything else is the answer as it came.

const realFetch = globalThis.fetch
const PATH = 'https://api.sophia.test/api/v1/conversations/c1/messages'

interface Sent {
  authorization: string | null
  key: string | null
  body: unknown
}

/** An API that refuses the tokens in `refused` (401) or answers `status`, and notes each request it was sent. */
function api(refused: readonly string[], status = 200) {
  const sent: Sent[] = []
  globalThis.fetch = (_url, init) => {
    const headers = new Headers(init?.headers)
    const authorization = headers.get('authorization')
    sent.push({ authorization, key: headers.get('idempotency-key'), body: init?.body })
    const token = authorization?.replace('Bearer ', '') ?? ''
    return Promise.resolve(new Response('{}', { status: refused.includes(token) ? 401 : status }))
  }
  return sent
}

/** A renewal that gives `fresh` and notes each token it was asked to renew. */
function renewingTo(fresh: string | null) {
  const asked: string[] = []
  renewTokensWith((stale) => {
    asked.push(stale)
    return Promise.resolve(fresh)
  })
  return asked
}

const write = (token: string, signal?: AbortSignal): ResendableInit => ({
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': 'k-1' },
  body: '{"text":"Check the March figures"}',
  ...(signal ? { signal } : {}),
})

describe('a request whose token the API refused goes again once, renewed', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
    renewTokensWith(null)
  })

  it('a 401 renews the token and sends the same request again: its key and its body, the new bearer', async () => {
    const sent = api(['t1'])
    const asked = renewingTo('t2')
    const reply = await apiFetch(PATH, write('t1'))
    assert.equal(reply.status, 200)
    assert.deepEqual(asked, ['t1'])
    assert.deepEqual(
      sent.map((s) => s.authorization),
      ['Bearer t1', 'Bearer t2'],
    )
    assert.deepEqual(
      sent.map((s) => s.key),
      ['k-1', 'k-1'],
    )
    assert.equal(sent[1]?.body, sent[0]?.body)
  })

  it('a second 401 is the answer: renewed once, sent twice, never more', async () => {
    const sent = api(['t1', 't2'])
    const asked = renewingTo('t2')
    assert.equal((await apiFetch(PATH, write('t1'))).status, 401)
    assert.deepEqual(asked, ['t1'])
    assert.equal(sent.length, 2)
  })

  it('nothing to renew with: the 401 is the answer, sent once', async () => {
    const sent = api(['t1'])
    renewingTo(null)
    assert.equal((await apiFetch(PATH, write('t1'))).status, 401)
    assert.equal(sent.length, 1)
  })

  it('a renewal that gives the same token sends nothing again', async () => {
    const sent = api(['t1'])
    renewingTo('t1')
    assert.equal((await apiFetch(PATH, write('t1'))).status, 401)
    assert.equal(sent.length, 1)
  })

  it('a 403 is never renewed: the project’s door is closed', async () => {
    const sent = api([], 403)
    const asked = renewingTo('t2')
    assert.equal((await apiFetch(PATH, write('t1'))).status, 403)
    assert.deepEqual(asked, [])
    assert.equal(sent.length, 1)
  })

  it('a request with no bearer (a public read) is never renewed', async () => {
    const sent = api([], 401)
    const asked = renewingTo('t2')
    assert.equal((await apiFetch(PATH, { method: 'GET' })).status, 401)
    assert.deepEqual(asked, [])
    assert.equal(sent.length, 1)
  })

  it('a page with no App registers no renewal: its 401 is the answer, as before', async () => {
    const sent = api(['t1'])
    assert.equal((await apiFetch(PATH, write('t1'))).status, 401)
    assert.equal(sent.length, 1)
  })

  it('a request aborted while its token is renewed ends as an abort, and goes nowhere again', async () => {
    const sent = api(['t1'])
    const bound = new AbortController()
    renewTokensWith(() => {
      bound.abort()
      return new Promise<string | null>(() => undefined) // an Auth service that never answers
    })
    await assert.rejects(apiFetch(PATH, write('t1', bound.signal)), { name: 'AbortError' })
    assert.equal(sent.length, 1)
  })
})
