import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { admitGoalCommand, ApiError, createProject, getSnapshot } from './client.ts'

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
    assert.match(read.message, /Snapshot/)

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
  })
})
