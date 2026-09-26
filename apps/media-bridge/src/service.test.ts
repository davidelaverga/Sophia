// The bridge's API client against a FAKE fetch: the capability is a bearer, and responses are validated.
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { httpMediaService, ServiceError } from './service.ts'

const VERSION = 'a'.repeat(64)

function fakeFetch(respond: (url: string, init: RequestInit) => Response) {
  const seen: Array<{ url: string; init: RequestInit }> = []
  const impl: typeof fetch = async (input, init = {}) => {
    await Promise.resolve()
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    seen.push({ url, init })
    return respond(url, init)
  }
  return { impl, seen }
}

describe('media service client', () => {
  it('long-polls assignments with the capability as a bearer and validates the batch', async () => {
    const { impl, seen } = fakeFetch(() => Response.json({ assignments: [], version: VERSION }))
    const service = httpMediaService('http://api.test/', 'cap-token-0123456789abcdef0123456789', impl)
    const batch = await service.assignments(VERSION, 25_000, new AbortController().signal)
    assert.deepEqual(batch, { assignments: [], version: VERSION })
    assert.equal(seen[0]?.url, `http://api.test/v1/media/assignments?waitMs=25000&after=${VERSION}`)
    assert.deepEqual(seen[0]?.init.headers, {
      authorization: 'Bearer cap-token-0123456789abcdef0123456789',
      'content-type': 'application/json',
    })
  })

  it('refuses a malformed assignment batch instead of acting on it', async () => {
    const { impl } = fakeFetch(() => Response.json({ assignments: [{ exchangeId: 'x' }], version: VERSION }))
    const service = httpMediaService('http://api.test', 'cap', impl)
    await assert.rejects(service.assignments(null, 0, new AbortController().signal))
  })

  it('validates tool results and surfaces HTTP failures', async () => {
    const ok = fakeFetch(() => Response.json({ status: 'admitted', output: { workId: 'w' } }))
    assert.deepEqual(
      await httpMediaService('http://api.test', 'cap', ok.impl).toolCall({
        exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        connectionGeneration: 1,
        callId: 'c1',
        name: 'project_status',
        args: {},
        inputEpoch: 1,
        actorId: '11111111-1111-4111-8111-111111111111',
      }),
      { status: 'admitted', output: { workId: 'w' } },
    )
    const bad = fakeFetch(() => Response.json({ status: 'done' }))
    await assert.rejects(
      httpMediaService('http://api.test', 'cap', bad.impl).toolCall({
        exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        connectionGeneration: 1,
        callId: 'c1',
        name: 'project_status',
        args: {},
        inputEpoch: 1,
        actorId: '11111111-1111-4111-8111-111111111111',
      }),
    )
    const denied = fakeFetch(() => new Response('{"code":"media_capability_required"}', { status: 401 }))
    await assert.rejects(
      httpMediaService('http://api.test', 'cap', denied.impl).holder({
        exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorId: '11111111-1111-4111-8111-111111111111',
        inputEpoch: 1,
        event: 'left',
      }),
      (err: unknown) => err instanceof ServiceError && err.status === 401,
    )
    const empty = fakeFetch(() => new Response(null, { status: 204 }))
    await httpMediaService('http://api.test', 'cap', empty.impl).announced({
      exchangeId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      taskId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      resultRevision: 1,
    })
  })
})
