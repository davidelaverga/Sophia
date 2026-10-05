import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createSophiaDshAdapter, sessionCodec } from './index.ts'

const TOKEN = 'x'.repeat(48)
const ctx = { companyId: 'company-a', adapterType: 'sophia_dsh', config: {} }

describe('sophia_dsh module', () => {
  it('fails its environment test without an origin or capability, and makes no request', async () => {
    let requests = 0
    const fetcher = () => {
      requests += 1
      return Promise.resolve(new Response('{}'))
    }
    const adapter = createSophiaDshAdapter({ env: {}, fetch: fetcher })
    const result = await adapter.testEnvironment(ctx)
    assert.equal(result.status, 'fail')
    assert.deepEqual(result.checks.map((c) => c.code).toSorted(), ['sophia_origin_missing', 'sophia_token_missing'])
    assert.equal(requests, 0)
  })

  it('checks only Sophia health, never echoing the capability', async () => {
    const urls: string[] = []
    const env = { SOPHIA_COORDINATION_URL: 'https://sophia.internal/', SOPHIA_COORDINATION_TOKEN: TOKEN }
    const fetcher = (url: string | URL | Request) => {
      urls.push(url instanceof Request ? url.url : url.toString())
      return Promise.resolve(new Response('{"ok":true}'))
    }
    const adapter = createSophiaDshAdapter({ env, fetch: fetcher })
    const result = await adapter.testEnvironment(ctx)
    assert.equal(result.status, 'pass')
    assert.deepEqual(urls, ['https://sophia.internal/health'])
    assert.ok(!JSON.stringify(result).includes(TOKEN))
  })

  it('starts nothing when the service has no endpoint', async () => {
    const adapter = createSophiaDshAdapter({ env: {} })
    const result = await adapter.execute({
      runId: 'run-1',
      agent: { id: 'a', companyId: 'company-a', name: 'r' },
      runtime: { sessionParams: null, sessionDisplayId: null },
      config: {},
      context: { issueId: 'issue-1' },
      onLog: () => Promise.resolve(),
    })
    assert.equal(result.errorCode, 'sophia_not_configured')
  })

  it("keeps only Sophia's identifiers in a session", () => {
    assert.deepEqual(
      sessionCodec.deserialize({ sophiaWorkId: 'w', nativeSessionId: 'n', prompt: 'x', sophiaAttemptId: 3 }),
      { sophiaWorkId: 'w', nativeSessionId: 'n' },
    )
    assert.equal(sessionCodec.deserialize('w'), null)
    assert.equal(sessionCodec.getDisplayId?.({ nativeSessionId: 'n' }), 'n')
  })
})
