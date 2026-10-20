// FND-C65 (R2-C64 P2): an accepted run's cleanup handles both outcomes. An unexpected failure of the whole run is
// reported once through the runner's error handler, no derived promise rejects unhandled, and shutdown still ends.
// No database or provider: the run itself is replaced, on this one runner, by one that fails (FIXTURE).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import pg from 'pg'
import { CompanionRunner } from './companion.ts'
import { rehearsalCompanion } from './companion-rehearsal.ts'

const turns = () => new Promise((resolve) => setImmediate(resolve))

describe('the companion runner’s shutdown (FND-C65)', () => {
  it('reports an accepted run that fails unexpectedly once, leaves nothing unhandled, and close still ends', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const pool = new pg.Pool({ max: 1 }) // never connected: the failing run asks no database
    const reported: unknown[] = []
    const runner = new CompanionRunner(pool, rehearsalCompanion(0), (err) => reported.push(err))
    // FIXTURE: this runner's whole run fails as no ordinary path does (an unexpected error past its own handling).
    Reflect.set(runner, 'run', async () => {
      await turns()
      throw new Error('C65 unexpected run failure')
    })
    try {
      // As the routes start it: nothing awaits or catches the returned promise.
      void runner.answer('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2')
      await runner.close()
      for (let i = 0; i < 5; i += 1) await turns()
      assert.equal(reported.length, 1, 'the failure is reported, once')
      assert.equal(reported[0] instanceof Error ? reported[0].message : '', 'C65 unexpected run failure')
      assert.deepEqual(unhandled, [], 'no unhandled rejection')
      // After close: nothing new is started (the turn would stay pending for the next process).
      await runner.answer('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c3')
      assert.equal(reported.length, 1, 'nothing started after close')
    } finally {
      process.off('unhandledRejection', onUnhandled)
      await pool.end()
    }
  })
})
