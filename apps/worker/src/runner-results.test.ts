import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import pg from 'pg'
import { RunnerResultsController, resultVersionKey } from './runner-results.ts'
import { runnerResultFailure, DbHostChannel } from '@sophia/persistence'

const tick = () => new Promise<void>((resolve) => setImmediate(resolve))

test('OFF maintains existing commitments with zero claims, enqueues or reservations', async () => {
  const pool = new pg.Pool()
  const queries: string[] = []
  mock.method(pool, 'query', (sql: string) => {
    queries.push(sql)
    return Promise.resolve({
      rows: [
        sql.includes('to_regprocedure') ? { ok: true } : { r: sql.includes('maintain_runner_results') ? 0 : null },
      ],
    })
  })
  const c = new RunnerResultsController(pool, { enabled: false })
  c.pass()
  await tick()
  await c.stop()
  assert.equal(queries.length, 3)
  assert.ok(queries[1]?.includes('maintain_runner_results'))
  assert.ok(queries.every((sql) => !sql.includes('claim_runner_result() AS')))
  await pool.end()
})

test('one deferred result promise cannot grow claims; shutdown fences new claims and returns bounded', async () => {
  const pool = new pg.Pool()
  let release: (() => void) | undefined
  let claims = 0
  const wait = new Promise<void>((resolve) => {
    release = resolve
  })
  mock.method(pool, 'query', async (sql: string) => {
    if (sql.includes('to_regprocedure')) return { rows: [{ ok: true }] }
    if (sql.includes('maintain_runner_results')) return { rows: [{ r: 0 }] }
    if (sql.includes('resume_runner_result')) return { rows: [{ r: null }] }
    claims += 1
    await wait
    return { rows: [{ r: null }] }
  })
  const c = new RunnerResultsController(pool, { enabled: true, shutdownMs: 10 })
  c.pass()
  await tick()
  for (let n = 0; n < 20; n += 1) c.pass()
  assert.equal(claims, 1)
  await c.stop()
  c.pass()
  assert.equal(claims, 1)
  release?.()
  await tick()
  await pool.end()
})

test('controller and host-answer failures never expose driver body/DETAIL/cause', async () => {
  const secret = 'synthetic-private-result-body-canary'
  const pool = new pg.Pool()
  mock.method(pool, 'query', () => Promise.reject(Object.assign(new Error(secret), { code: 'XX000', detail: secret })))
  const lines: string[] = []
  const c = new RunnerResultsController(pool, { enabled: true, log: (line) => lines.push(line) })
  c.pass()
  await tick()
  await c.stop()
  assert.deepEqual(lines, ['runner result pass failed'])
  assert.equal(runnerResultFailure(new Error(secret)).message, 'Result service unavailable')
  const host = new DbHostChannel(pool, 'a'.repeat(43))
  await assert.rejects(
    host.answer('10000000-0000-4000-8000-000000000001', {
      v: 1,
      kind: 'collection_unavailable',
      reason: 'unavailable',
    }),
    { message: 'Owner host result answer failed' },
  )
  assert.equal(JSON.stringify(lines).includes(secret), false)
  await pool.end()
})

test('stable native version excludes cursor/page/digest observation metadata', () => {
  const c = {
    envelope: { operationId: 'op', bindingId: 'binding' },
    journalId: 'journal',
    namespace: 'client:synthetic',
  }
  const r = {
    v: 1 as const,
    kind: 'collected' as const,
    operationId: 'op',
    bindingId: 'binding',
    journalId: 'journal',
    envelopeDigest: 'a'.repeat(64),
    threadId: 'thread',
    runId: 'run',
    inputMessageId: 'input',
    messageId: 'assistant',
    itemId: 'item',
    text: 'body',
    textSha256: 'b'.repeat(64),
    byteLength: 4,
    pages: 2,
    lastPosition: 1,
    coverageDigest: 'c'.repeat(64),
    resultDigest: 'd'.repeat(64),
  }
  const key = resultVersionKey(c, r)
  assert.equal(
    resultVersionKey(c, {
      ...r,
      pages: 4,
      lastPosition: 7,
      coverageDigest: 'e'.repeat(64),
      resultDigest: 'f'.repeat(64),
    }),
    key,
  )
  assert.notEqual(resultVersionKey(c, { ...r, runId: 'another-run' }), key)
  assert.notEqual(resultVersionKey(c, { ...r, itemId: 'another-item' }), key)
})
