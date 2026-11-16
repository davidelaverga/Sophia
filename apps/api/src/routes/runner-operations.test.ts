import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { describe, it } from 'node:test'
import type pg from 'pg'
import { buildApp } from '../app.ts'

// A47/A50 declare every id a runner operation names as `format: uuid`: any case, optionally `urn:uuid:`. The database
// reads only the lowercase spelling (0092/0096 uuid_re), so the route hands it that one (review of #513, P3 6). Here the
// database is a FAKE that records what the admission is sent and answers as 0096 does for a spelling it can't read; the
// real admission over each spelling is runner-operations.db.test.ts's.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A pool whose installation check passes and whose admission records the request and answers with a receipt. */
function recordingPool() {
  const sent: Record<string, unknown>[] = []
  const query = (sql: string, params: unknown[] = []) => {
    if (sql.includes('admit_owner_runner_operation(uuid,text,jsonb,text)'))
      return Promise.resolve({ rows: [{ ok: true }] })
    if (!sql.includes('sophia.admit_owner_runner_operation(')) return Promise.resolve({ rows: [], rowCount: 0 })
    const request = JSON.parse(String(params[2])) as Record<string, unknown>
    sent.push(request)
    const named = [request.resourceId, request.goalId, request.targetOperationId, request.sourceIds ?? []].flat()
    if (named.some((id) => typeof id === 'string' && !UUID_RE.test(id)))
      return Promise.reject(Object.assign(new Error('Resource not found'), { code: '22023' }))
    const receipt = { operationId: randomUUID(), kind: request.kind, state: 'admitted', revision: 1 }
    return Promise.resolve({ rows: [{ receipt: { ...receipt, admittedAt: new Date().toISOString() } }], rowCount: 1 })
  }
  const pool = { query, connect: () => Promise.resolve({ query, release: () => undefined }) } as unknown as pg.Pool
  return { pool, sent }
}

const OWNER = randomUUID()
const verifyActor = (authorization: string | undefined) =>
  Promise.resolve({ id: String(authorization).slice('Bearer '.length), name: null, contact: null, anonymous: false })

describe('an owner-runner operation’s body ids', () => {
  it('reach the database as the lowercase spelling, from upper case and from urn:uuid:', async () => {
    const { pool, sent } = recordingPool()
    const app = buildApp({ pool, verifyActor, ownerRunnerAdmissions: 'admit' })
    try {
      const [resourceId, goalId, targetOperationId, source] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()]
      const ids = { resourceId, goalId, targetOperationId, sourceIds: [source] }
      const spelled = (spell: (id: string) => string) => ({
        kind: 'input',
        resourceId: spell(resourceId),
        goalId: spell(goalId),
        targetOperationId: spell(targetOperationId),
        message: 'And the outbox?',
        sourceIds: [spell(source)],
      })
      for (const [what, spell] of [
        ['lowercase', (id: string) => id],
        ['upper case', (id: string) => id.toUpperCase()],
        ['urn:uuid:', (id: string) => `urn:uuid:${id}`],
        ['URN:UUID: in upper case', (id: string) => `URN:UUID:${id.toUpperCase()}`],
      ] as const) {
        const res = await app.inject({
          method: 'POST',
          url: `/api/v1/projects/${randomUUID()}/runner-operations`,
          headers: { authorization: `Bearer ${OWNER}`, 'idempotency-key': randomUUID() },
          payload: spelled(spell),
        })
        assert.equal(res.statusCode, 202, `${what}: ${res.body}`)
        const { resourceId: r, goalId: g, targetOperationId: t, sourceIds: s } = sent.at(-1) ?? {}
        assert.deepEqual({ resourceId: r, goalId: g, targetOperationId: t, sourceIds: s }, ids, what)
      }
    } finally {
      await app.close()
    }
  })
})
