// RuntimeDispatcher shutdown against a LABELLED FAKE pool whose connections always fail: the database is down from
// startup, so the first LISTEN never happens. Review of PR #15: stop() must still return, and end the listener's
// retries, or the worker never reaches pool.end() and exits only when the platform kills it.
import assert from 'node:assert/strict'
import { it } from 'node:test'
import type pg from 'pg'
import { RuntimeDispatcher } from './runtime-dispatch.ts'

function downPool(): { pool: pg.Pool; attempts: () => number } {
  let attempts = 0
  const pool = {
    connect: () => {
      attempts += 1
      return Promise.reject(new Error('connect ECONNREFUSED'))
    },
  } as unknown as pg.Pool
  return { pool, attempts: () => attempts }
}

const within = <T>(ms: number, p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`not settled within ${ms} ms`)), ms).unref()),
  ])

it('stops while the first LISTEN is still being retried, and ends the retries', async () => {
  const { pool, attempts } = downPool()
  const dispatcher = new RuntimeDispatcher(pool, { workerId: 'test-worker', idleMs: 50 })
  dispatcher.start()
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(attempts(), 1, 'the listener tried to connect')

  await within(500, dispatcher.stop())

  // The listener's first retry is due 1 s after its failure: none may follow a stop.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.equal(attempts(), 1, 'no LISTEN retry after stop()')
})
