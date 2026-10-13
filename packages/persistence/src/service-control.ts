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
