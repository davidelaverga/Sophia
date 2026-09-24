/**
 * LABELLED FIXTURE — stands in for S1-02's Sophia service until it lands.
 *
 * Speaks the bridge's runtime wire protocol (packages/dsh-bundle/src/transport.ts)
 * over plain HTTP on 127.0.0.1: an in-memory command outbox with sequence
 * numbers, receipts and observations logs, bearer-token checks, and a
 * configurable binding set returned by `hello`. It is not durable admission,
 * not authentication, and not evidence for S1-02's acceptance.
 */

import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

export async function startFixtureService({ token = randomUUID(), runtimeUnitId, bindings = [] } = {}) {
  const outbox = [] // { seq, command }
  const receipts = []
  const observations = []
  const hellos = []
  const readiness = []
  const waiters = new Set()
  let seq = 0
  const state = { bindings: [...bindings] }

  const notify = () => { for (const wake of waiters) wake(); waiters.clear() }

  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(body === undefined ? '' : JSON.stringify(body))
    }
    if (req.headers.authorization !== `Bearer ${token}`) return reply(401, { error: 'bad token' })
    if (req.headers['x-sophia-runtime-unit'] !== runtimeUnitId) return reply(403, { error: 'wrong runtime unit' })
    const url = new URL(req.url, 'http://fixture')
    let body = ''
    for await (const chunk of req) body += chunk
    const json = body ? JSON.parse(body) : undefined
    if (req.method === 'POST' && url.pathname === '/v1/runtime/hello') {
      hellos.push(json)
      return reply(200, { projectId: 'proj-fixture', leaseId: `lease-${hellos.length}`, authorityEpoch: 1, bindings: state.bindings, cursor: 0 })
    }
    if (req.method === 'GET' && url.pathname === '/v1/runtime/commands') {
      const after = Number(url.searchParams.get('after') ?? 0)
      const waitMs = Math.min(Number(url.searchParams.get('waitMs') ?? 0), 2000)
      const pending = () => outbox.filter((c) => c.seq > after)
      if (pending().length === 0 && waitMs > 0) {
        await new Promise((resolve) => {
          const timer = setTimeout(resolve, waitMs)
          waiters.add(() => { clearTimeout(timer); resolve() })
          req.on('close', () => { clearTimeout(timer); resolve() })
        })
      }
      return reply(200, { commands: pending(), cursor: Math.max(after, ...pending().map((c) => c.seq), 0) })
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/receipts') {
      receipts.push(...json.receipts)
      notify()
      return reply(204)
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/observations') {
      observations.push(...json.observations)
      notify()
      return reply(204)
    }
    if (req.method === 'POST' && url.pathname === '/v1/runtime/ready') {
      readiness.push(json)
      notify()
      return reply(204)
    }
    return reply(404, { error: 'not found' })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()

  /** Wait until `predicate()` returns a truthy value, or fail after `timeoutMs`. */
  const waitFor = async (predicate, timeoutMs = 20000, what = 'condition') => {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const value = predicate()
      if (value) return value
      const left = deadline - Date.now()
      if (left <= 0) throw new Error(`fixture: timed out waiting for ${what}`)
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, Math.min(left, 100))
        waiters.add(() => { clearTimeout(timer); resolve() })
      })
    }
  }

  return {
    url: `http://127.0.0.1:${port}`,
    token,
    receipts,
    observations,
    hellos,
    readiness,
    setBindings: (next) => { state.bindings = [...next] },
    /** Enqueue a command exactly as S1-02's outbox would (same object may be enqueued twice). */
    enqueue(command) {
      seq += 1
      outbox.push({ seq, command })
      notify()
      return seq
    },
    receiptsFor: (commandId) => receipts.filter((r) => r.commandId === commandId),
    waitForReceipt: (commandId, stage, timeoutMs) =>
      waitFor(() => receipts.find((r) => r.commandId === commandId && (!stage || r.stage === stage)), timeoutMs, `${stage ?? 'any'} receipt for ${commandId}`),
    waitForReady: (timeoutMs) => waitFor(() => readiness.find((r) => r.state === 'ready'), timeoutMs, 'bridge readiness'),
    waitFor,
    close: () => new Promise((resolve) => server.close(resolve)),
  }
}

/** Build a well-formed runtime command for the fixture. */
export function command(kind, { attemptId, runtimeUnitId, epoch = 1, text, commandId = `cmd-${randomUUID()}`, expectedNativeSessionId = null } = {}) {
  return {
    schema: 'sophia.runtime-command.v1',
    commandId,
    binding: { projectId: 'proj-fixture', goalId: 'goal-fixture', goalRevision: 1, attemptId, resourceId: 'dsh-native', authorityEpoch: epoch, runtimeUnitId },
    kind,
    expectedNativeSessionId,
    contextPacketId: null,
    payload: text === undefined ? {} : { text },
  }
}
