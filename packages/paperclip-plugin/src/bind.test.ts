import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hostOf, hostProcessOf, pluginHandlers, processGoneOf, type ProcFs, type SdkContext } from './bind.ts'
import { UnansweredHostCall } from './host.ts'
import { manifest, REVIEWER_AGENT_KEY, SETTLE_JOB_KEY } from './manifest.ts'

/** A `/proc/<pid>/stat` line: the command name may hold spaces and parentheses; field 22 is the start time. */
const stat = (pid: number, start: number) =>
  `${String(pid)} (node (paperclip) srv) S 1 ${String(pid)} 1 0 -1 4194560 1 2 3 4 5 6 7 8 20 0 11 0 ${String(start)} 100 200`

/** A fake /proc: the files given, a fixed boot and pid namespace, and every other path failing with `missing`. */
function procOf(files: Readonly<Record<string, string>>, missing = 'ENOENT'): ProcFs {
  const fail = (path: string): never => {
    throw Object.assign(new Error(`${missing}: ${path}`), { code: missing })
  }
  const all: Readonly<Record<string, string>> =
    Object.keys(files).length === 0 ? {} : { ...files, '/proc/sys/kernel/random/boot_id': 'boot-1\n' }
  return {
    read: (path) => all[path] ?? fail(path),
    link: (path) => (path === '/proc/self/ns/pid' && Object.keys(all).length > 0 ? 'pid:[4026531836]' : fail(path)),
  }
}

/** Record a call and answer. */
function noted<T>(calls: string[], call: string, answer: T): Promise<T> {
  calls.push(call)
  return Promise.resolve(answer)
}

function fakeContext(calls: string[], jobs = new Map<string, (job: unknown) => Promise<void>>()): SdkContext {
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
    db: {
      namespace: 'ns',
      query: (sql) => noted(calls, `query:${sql.includes('ns.effects') ? 'effects' : 'other'}`, []),
      execute: () => Promise.resolve({ rowCount: 1 }),
    },
    config: { get: (company) => noted(calls, `config:${company ?? ''}`, {}) },
    jobs: { register: (key, fn) => jobs.set(key, fn) },
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

  it('tells an update the worker stopped waiting for (the pin RPC timeout) apart from the host error answer', async () => {
    const failing = (err: Error): SdkContext => {
      const ctx = fakeContext([])
      return { ...ctx, issues: { ...ctx.issues, update: () => Promise.reject(err) } }
    }
    const timeout = Object.assign(new Error('Worker→host call "issues.update" timed out after 30000ms'), {
      code: -32003,
    })
    await assert.rejects(hostOf(failing(timeout)).issues.update('i1', { status: 'blocked' }, 'c1'), UnansweredHostCall)
    const answered = Object.assign(new Error('activity log failed'), { code: -32603 })
    await assert.rejects(hostOf(failing(answered)).issues.update('i1', { status: 'blocked' }, 'c1'), (err) => {
      assert.equal(err, answered, 'the host answered: its own error, unchanged')
      return true
    })
  })

  it('names the host process by its pid and start time, in its namespace: the machine boot and the pid namespace', () => {
    const fs = procOf({ '/proc/4242/stat': stat(4242, 987654) })
    assert.deepEqual(hostProcessOf(4242, fs), {
      namespace: 'boot-1/pid:[4026531836]',
      process: '4242:987654',
    })
    assert.equal(hostProcessOf(4242, procOf({})), null, 'no /proc: nothing is claimed')
    assert.equal(hostProcessOf(0, fs), null)
  })

  it('calls a recorded process gone only on proof: no process with its pid, or one that started at another time', () => {
    assert.equal(processGoneOf('4242:987654', procOf({ '/proc/4242/stat': stat(4242, 987654) })), false, 'still runs')
    assert.equal(processGoneOf('4242:987654', procOf({ '/proc/4242/stat': stat(4242, 999999) })), true, 'pid reused')
    assert.equal(processGoneOf('4242:987654', procOf({})), true, 'no such process')
    assert.equal(processGoneOf('4242:987654', procOf({}, 'EACCES')), false, 'unreadable is not proof')
    assert.equal(processGoneOf('4242:987654', procOf({ '/proc/4242/stat': 'garbage' })), false)
    assert.equal(processGoneOf('not-a-process', procOf({})), false)
  })

  it('registers the settle job the manifest schedules, which reads the open status writes', async () => {
    const calls: string[] = []
    const jobs = new Map<string, (job: unknown) => Promise<void>>()
    await pluginHandlers().setup(fakeContext(calls, jobs))
    assert.deepEqual([...jobs.keys()], [SETTLE_JOB_KEY])
    assert.deepEqual(
      manifest.jobs.map((j) => [j.jobKey, j.schedule]),
      [[SETTLE_JOB_KEY, '* * * * *']],
    )
    assert.ok(manifest.capabilities.includes('jobs.schedule'))
    await jobs.get(SETTLE_JOB_KEY)?.({})
    assert.deepEqual(calls, ['query:effects'])
  })
})
