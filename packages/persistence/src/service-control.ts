// Opt-in service transaction cancellation. Retire an expired connection; it must never reenter the idle pool.
// A COMMIT already sent can remain uncertain, and a queued pool acquisition is observed until actual settlement.
import type pg from 'pg'
import { DomainError } from '@sophia/domain'

export interface ServiceControl {
  signal: AbortSignal
  deadline: number
}

export function controlledQueryTimedOut(error: unknown, control?: ServiceControl): boolean {
  return control !== undefined && error instanceof Error && 'code' in error && error.code === '57014'
}

export function checkServiceControl(control?: ServiceControl): void {
  if (control && (control.signal.aborted || performance.now() >= control.deadline)) {
    throw new DomainError('unavailable', 'Database operation timed out')
  }
}

export function serviceClient(client: pg.PoolClient, control?: ServiceControl) {
  let released = false
  const release = (retire = false) => {
    if (released) return
    released = true
    client.release(retire)
  }
  const abort = () => release(true)
  let timer: ReturnType<typeof setTimeout> | undefined
  if (control) {
    control.signal.addEventListener('abort', abort, { once: true })
    timer = setTimeout(abort, Math.max(0, control.deadline - performance.now()))
    timer.unref()
  }
  return {
    check() {
      try {
        checkServiceControl(control)
      } catch (error) {
        abort()
        throw error
      }
    },
    retired: () => released,
    retire: abort,
    finish() {
      clearTimeout(timer)
      control?.signal.removeEventListener('abort', abort)
      release()
    },
  }
}

/**
 * How long before a controlled read's deadline its SQL must end (R-C1-READ-BOUNDS-01): room for PostgreSQL's own
 * cancellation, its error and the retirement of the connection, all within the read's absolute budget.
 */
export const READ_SETTLE_MS = 100

type Lease = ReturnType<typeof serviceClient>

/**
 * A controlled read's client (R-C1-READ-BOUNDS-01). Each statement starts only while the read's absolute budget
 * remains, and the server bounds it to what remains then (statement_timeout, re-armed before each statement, ending
 * READ_SETTLE_MS before the deadline), not to what remained when the transaction began: a statement begun late is ended
 * by PostgreSQL itself within the read's deadline. Only `query` is changed; a read's callers await it.
 */
export function budgetedRead(client: pg.PoolClient, control: ServiceControl, lease: Lease): pg.PoolClient {
  const query = async (...args: Parameters<pg.PoolClient['query']>) => {
    lease.check()
    const ms = Math.floor(control.deadline - READ_SETTLE_MS - performance.now())
    if (ms < 1) {
      lease.retire()
      throw new DomainError('unavailable', 'Database operation timed out')
    }
    await client.query("SELECT set_config('statement_timeout', $1, true)", [String(ms)])
    lease.check()
    return client.query(...args)
  }
  return new Proxy<pg.PoolClient>(client, {
    get: (target, key): unknown => (key === 'query' ? query : Reflect.get(target, key, target)),
  })
}
