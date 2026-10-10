import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import {
  admitGoalCommand,
  ApiError,
  callApi,
  createProject,
  getSnapshot,
  READ_TIMEOUT_MS,
  WRITE_TIMEOUT_MS,
} from './client.ts'

const P = '6f1f3a52-4b8e-4c62-9d7e-0a1b2c3d4e5f'
const G = '0c5e9b1a-2d3f-4a6b-8c7d-9e0f1a2b3c4d'
const realFetch = globalThis.fetch

/** Answer every fetch with one fixed reply. */
function reply(status: number, body: unknown): void {
  globalThis.fetch = () =>
    Promise.resolve(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

/** A server that takes the connection and never answers: the call ends only when its signal aborts. */
function silence(): void {
  globalThis.fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })
}

async function apiError(call: Promise<unknown>): Promise<ApiError> {
  try {
    await call
  } catch (err: unknown) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('expected an ApiError')
}

const command = {
  kind: 'hold',
  goalId: G,
  expectedGoalRevision: 1,
  expectedAuthorityEpoch: 1,
  bodySourceId: null,
} as const

describe('Studio API client', () => {
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  it('refuses a success reply that breaks the contract, with the retry that is safe', async () => {
    reply(200, { projectId: P, title: 'Sophia', cursor: 7 })
    const read = await apiError(getSnapshot('t', P))
    assert.deepEqual([read.status, read.code, read.retry], [200, 'contract_violation', 'safe_read'])
    // The person reads that the reply couldn't be read; the contract's own words stay with the error, for us.
    assert.equal(read.message, 'Sophia’s reply couldn’t be read.')
    assert.match(read.cause instanceof Error ? read.cause.message : '', /Snapshot/)

    // The admission committed (202) but its receipt is unreadable: retry with the same key.
    reply(202, { commandId: G, projectId: P, cursor: '9', stage: 'admitted' })
    const admitted = await apiError(admitGoalCommand('t', P, 'key-1', command))
    assert.deepEqual([admitted.code, admitted.retry], ['contract_violation', 'same_admission_key'])

    reply(201, '<!doctype html>')
    const created = await apiError(createProject('t', 'key-2', 'Sophia'))
    assert.deepEqual([created.code, created.retry], ['contract_violation', 'same_admission_key'])
  })

  it('uses the error body only when it is a contract Error, else the HTTP status', async () => {
    reply(409, { code: 'stale_revision', message: 'Stale goal revision', requestId: G, retry: 'never' })
    const stale = await apiError(admitGoalCommand('t', P, 'key-3', command))
    assert.deepEqual([stale.status, stale.code, stale.message], [409, 'stale_revision', 'Stale goal revision'])

    reply(502, { code: 'from_a_proxy' })
    const proxy = await apiError(getSnapshot('t', P))
    assert.deepEqual([proxy.status, proxy.code, proxy.retry], [502, 'http_502', 'never'])
    // HTTP/2 carries no status text: the refusal still has words, or it shows as nothing at all; and the same words
    // over HTTP/1.1, whose status text is not ours to show. «Try again» only where it can help; the status is the
    // code's, never the person's to read.
    assert.equal(proxy.message, 'That didn’t go through. Try again.')
    globalThis.fetch = () => Promise.resolve(new Response('<html>', { status: 404, statusText: 'Not Found' }))
    const missing = await apiError(getSnapshot('t', P))
    assert.deepEqual([missing.code, missing.message], ['http_404', 'That didn’t go through.'])
  })

  it('never waits for good: a write with no reply in time is an unknown outcome, retried with the same key', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    let settled = false
    const created = apiError(createProject('t', 'key-4', 'Sophia')).finally(() => (settled = true))
    t.mock.timers.tick(WRITE_TIMEOUT_MS - 1)
    await Promise.resolve()
    assert.equal(settled, false)
    t.mock.timers.tick(1)
    const late = await created
    assert.deepEqual([late.status, late.code, late.retry], [0, 'outcome_unknown', 'same_admission_key'])
  })

  it('never labels a write without a key safe to repeat when it got no answer', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const decided = apiError(callApi(`/api/v1/projects/${P}/lobby/${G}`, { token: 't', method: 'PUT' }, (v) => v))
    t.mock.timers.tick(WRITE_TIMEOUT_MS)
    assert.deepEqual([(await decided).code, (await decided).retry], ['outcome_unknown', 'never'])
  })

  it('a read gives up sooner than a write, and a caller that stops waiting ends it at once', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    silence()
    const read = getSnapshot('t', P)
    t.mock.timers.tick(READ_TIMEOUT_MS)
    await assert.rejects(read, { name: 'AbortError' })

    const listed = apiError(callApi(`/api/v1/projects/${P}/membership`, { token: 't', method: 'GET' }, (v) => v))
    t.mock.timers.tick(READ_TIMEOUT_MS)
    assert.deepEqual([(await listed).code, (await listed).retry], ['outcome_unknown', 'safe_read'])

    const caller = new AbortController()
    const cancelled = getSnapshot('t', P, caller.signal)
    caller.abort()
    await assert.rejects(cancelled, { name: 'AbortError' })
  })
})
