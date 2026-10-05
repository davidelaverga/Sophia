import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hostOf, pluginHandlers, type SdkContext } from './bind.ts'
import { REVIEWER_AGENT_KEY } from './manifest.ts'

/** Record a call and answer. */
function noted<T>(calls: string[], call: string, answer: T): Promise<T> {
  calls.push(call)
  return Promise.resolve(answer)
}

function fakeContext(calls: string[]): SdkContext {
  const issue = {
    id: 'i1',
    companyId: 'c1',
    status: 'todo',
    originKind: 'plugin:sophia.coordination:commission',
    originId: 'k',
  }
  return {
    issues: {
      list: (input) => noted(calls, `list:${input.originKind ?? ''}:${input.originId ?? ''}`, [issue]),
      get: () => Promise.resolve(null),
      create: () => Promise.resolve(issue),
      update: (_id, patch) => Promise.resolve({ ...issue, status: patch.status ?? issue.status }),
      requestWakeup: (_id, _company, options) =>
        noted(calls, `wake:${options?.idempotencyKey ?? ''}`, { queued: true }),
    },
    agents: { managed: { reconcile: (key, company) => noted(calls, `agent:${key}:${company}`, { agentId: 'a1' }) } },
    db: { namespace: 'ns', query: () => Promise.resolve([]), execute: () => Promise.resolve({ rowCount: 1 }) },
    config: { get: (company) => noted(calls, `config:${company ?? ''}`, {}) },
  }
}

describe('SDK binding', () => {
  it("maps the SDK's issues, managed agent and namespace onto the host", async () => {
    const calls: string[] = []
    const host = hostOf(fakeContext(calls), () => 1_800_000_000_500)
    const [found] = await host.issues.list({
      companyId: 'c1',
      originKind: 'plugin:sophia.coordination:commission',
      originId: 'k',
      limit: 2,
    })
    assert.deepEqual(found, {
      id: 'i1',
      companyId: 'c1',
      projectId: null,
      status: 'todo',
      originKind: 'plugin:sophia.coordination:commission',
      originId: 'k',
    })
    assert.equal(await host.reviewerAgent('c1'), 'a1')
    assert.equal(host.namespace, 'ns')
    assert.equal(host.now(), 1_800_000_000)
    assert.deepEqual(
      await host.issues.requestWakeup('i1', 'c1', { reason: 'r', contextSource: 's', idempotencyKey: 'key' }),
      { queued: true },
    )
    assert.deepEqual(calls, [
      'list:plugin:sophia.coordination:commission:k',
      `agent:${REVIEWER_AGENT_KEY}:c1`,
      'wake:key',
    ])
  })

  it('answers 503 until setup ran, then hands requests to the handlers', async () => {
    const handlers = pluginHandlers()
    const request = {
      routeKey: 'commission',
      params: {},
      body: {},
      actor: { actorType: 'user' as const, actorId: 'u' },
      companyId: 'c1',
    }
    assert.equal((await handlers.onApiRequest(request)).status, 503)
    await handlers.setup(fakeContext([]))
    const configured = await handlers.onApiRequest(request)
    assert.equal(configured.status, 422, 'a malformed body is refused before the configuration is read')
  })
})
